import re
import os
import json
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Real dev setup: Load environment variables directly from the local .env file
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="NexaFinance Parser Engine", version="1.0.0")

# --- 1. CONFIGURATION & INITIALIZATION ---
# No more hardcoded fallback strings! 
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("CRITICAL: MONGO_URI variable missing from environment configurations.")

db_client = AsyncIOMotorClient(MONGO_URI)
db = db_client["NexaFinance"]

# The Gemini Client automatically hooks into os.getenv("GEMINI_API_KEY") underneath
gemini_client = genai.Client()

# --- 2. DATA SCHEMAS ---
class IncomingSMS(BaseModel):
    sender: str = Field(..., description="The shortcode or sender ID, e.g., 'MPESA', 'EQUITY'")
    text: str = Field(..., description="The raw unparsed text message from the device")

class ParsedTransaction(BaseModel):
    transaction_code: Optional[str] = None
    source_wallet: str
    destination_entity: str
    amount: float
    transaction_fee: float = 0.0
    currency: str = "KES"
    transaction_type: str = "Transfer"
    category: str = "General"
    account_balance: Optional[float] = Field(None, description="The net closing balance of the account or wallet after this transaction occurs, if mentioned.")

# --- 3. DATA MASKING ---
def mask_sensitive_data(text: str) -> str:
    return re.sub(r'\b\d{4,}\b', '[ACC_HIDDEN]', text)

# --- 4. LOCAL PARSER (REGEX) ---
def try_local_parse(sender: str, text: str) -> Optional[Dict[str, Any]]:
    sender_clean = sender.upper().strip()
    if "MPESA" in sender_clean:
        pattern = r"(?P<tx_id>[A-Z0-9]{10}) Confirmed\. Ksh(?P<amount>[\d,]+\.\d{2}) paid to (?P<recipient>.*?) via Paybill (?P<paybill>\d+)"
        match = re.search(pattern, text)
        if match:
            data = match.groupdict()
            return {
                "transaction_code": data["tx_id"],
                "source_wallet": "M-Pesa",
                "destination_entity": data["recipient"].strip(),
                "amount": float(data["amount"].replace(",", "")),
                "transaction_type": "Transfer",
                "category": "Bank Transfer"
            }
    return None

# --- 5. GEMINI AI PARSING LAYER ---
def gemini_fallback_parse(masked_text: str) -> Dict[str, Any]:
    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Parse this transaction message accurately: {masked_text}",
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You are a strict financial ledger data extraction utility. "
                    "Extract data into the requested structural schema template format perfectly."
                ),
                response_mime_type="application/json",
                response_schema=ParsedTransaction,
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini parsing failed: {str(e)}")

# --- 6. ENDPOINTS ---
@app.post("/api/v1/parse", response_model=ParsedTransaction)
async def parse_sms_webhook(payload: IncomingSMS):
    local_result = try_local_parse(payload.sender, payload.text)
    if local_result:
        final_data = local_result
    else:
        masked_text = mask_sensitive_data(payload.text)
        final_data = gemini_fallback_parse(masked_text)
    
    final_data["raw_sms_sender"] = payload.sender
    final_data["created_at"] = datetime.utcnow()
    
    try:
        final_data["user_id"] = "default_test_user_123" 
        await db["transactions"].insert_one(final_data)
    except Exception as e:
        print(f"Database write failed: {e}")
    
    final_data.pop("_id", None) 
    return ParsedTransaction(**final_data)