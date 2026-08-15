import logging
import os

from google import genai


logger = logging.getLogger("s_link.gemini")

_api_key = os.getenv("GEMINI_API_KEY", "")
_model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not _api_key or _api_key == "dummy_gemini_key":
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        _client = genai.Client(api_key=_api_key)
    return _client


def summarize_feedback(text: str) -> str:
    prompt = (
        "You are helping evaluate a service provider.\n"
        "Summarize the following customer reviews into 3 bullet points: "
        "strengths and weaknesses.\n\n"
        "You need to make your description as short as possible and be straight "
        "to the point.\n\n"
        "TRY TO VARY YOUR WORDINGS. VERY IMPORTANT. Especially do not use "
        "Recommended because... everywhere\n\n"
        f"Reviews:\n{text}"
    )
    client = _get_client()
    response = client.models.generate_content(
        model=_model_name,
        contents=prompt,
    )
    summary = (getattr(response, "text", None) or "").strip()
    if not summary:
        logger.warning("Gemini returned empty summary for feedback batch")
        return "No summary could be generated."
    return summary
