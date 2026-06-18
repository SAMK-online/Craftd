"""
OCR Service: uses Claude Vision to parse business card images
into structured contact data.
"""
from __future__ import annotations

import base64
import logging

import anthropic

from app.config import get_settings
from app.models.pipeline import ContactInput, ParsedCard

logger = logging.getLogger(__name__)

OCR_PROMPT = """
You are parsing a business card image. Extract every piece of contact information visible.

Return ONLY a JSON object with these exact keys (use null for missing fields):
{
  "name": "Full Name",
  "company": "Company Name",
  "title": "Job Title",
  "email": "email@company.com",
  "phone": "+1 555 123 4567",
  "linkedin_url": "https://linkedin.com/in/handle",
  "website": "https://company.com",
  "raw_text": "all visible text on the card concatenated"
}

Rules:
- name and company are required. If you cannot confidently read either, set to "UNKNOWN"
- Normalise phone numbers to international format if possible
- LinkedIn URL: only include if explicitly on the card (do not guess from name)
- raw_text: concatenate every word/phrase visible on the card, space-separated
- Return valid JSON only, no markdown fences, no commentary
"""


async def parse_business_card(
    card_image_base64: str,
    media_type: str = "image/jpeg",
) -> ParsedCard:
    """
    Send a base64 business card image to Claude Vision.
    Returns a ParsedCard with all extractable fields populated.
    """
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.require_anthropic())

    logger.info("Sending business card to Claude Vision for OCR")

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": card_image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": OCR_PROMPT,
                    },
                ],
            }
        ],
    )

    import json

    raw = message.content[0].text.strip()
    # Strip markdown fences if the model added them despite instructions
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Claude Vision returned non-JSON: %s", raw)
        raise ValueError(f"OCR response could not be parsed as JSON: {e}") from e

    logger.info("OCR extracted: name=%s company=%s", data.get("name"), data.get("company"))

    return ParsedCard(
        name=data.get("name") or "UNKNOWN",
        company=data.get("company") or "UNKNOWN",
        title=data.get("title"),
        email=data.get("email"),
        phone=data.get("phone"),
        linkedin_url=data.get("linkedin_url"),
        website=data.get("website"),
        raw_text=data.get("raw_text", ""),
    )


def resolve_contact_info(input_data: ContactInput, parsed_card: ParsedCard | None) -> dict:
    """
    Merge typed input and OCR output, preferring typed values when both present.
    Returns resolved (name, company, title).
    """
    name = input_data.name or (parsed_card.name if parsed_card else None) or "UNKNOWN"
    company = input_data.company or (parsed_card.company if parsed_card else None) or "UNKNOWN"
    title = input_data.title or (parsed_card.title if parsed_card else None)
    return {"name": name, "company": company, "title": title}
