"""Offline request constructors only. No network client, key, or live calls."""
import base64
from decimal import Decimal

API_BASE = 'https://api.meta.ai/v1'
SAM_MODEL = 'sam-3.1'
REASONING_MODEL = 'muse-spark-1.3'  # Standard, never Contributor.

def segment_image(image_bytes, concept):
    if not isinstance(image_bytes, bytes) or not 0 < len(image_bytes) <= 1_000_000:
        raise ValueError('Use a nonempty image <=1MB')
    if not isinstance(concept, str) or not 0 < len(concept.strip()) <= 80:
        raise ValueError('Use one concise noun phrase')
    # No URL fetching; no SSRF and no public upload required.
    if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif image_bytes.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    else:
        raise ValueError('PNG or JPEG signature required; decoder validation still needed')
    image = f'data:{mime};base64,'+base64.b64encode(image_bytes).decode('ascii')
    return {'model':SAM_MODEL, 'input':[{'type':'message','role':'user','content':[
        {'type':'input_text','text':concept.strip()},
        {'type':'input_image','image_url':image},
    ]}], 'stream':False}

def image_cost(count):
    if type(count) is not int or count < 0:
        raise ValueError('Count must be a nonnegative integer')
    return Decimal(count)*Decimal('0.0025')

class TestBudget:
    """Local ledger, NOT a provider-enforced account spending cap."""
    def __init__(self, max_images=10):
        self.remaining=max_images
    def reserve_image(self):
        if self.remaining <= 0: raise ValueError('Test image count exhausted')
        # No automatic retries/refunds: uncertain outcomes still consume allowance.
        self.remaining -= 1

def reasoning_question(question, max_completion_tokens=1024):
    """Offline text-only proposal. Does not authorize a request or enforce billing."""
    if not isinstance(question, str) or not 0 < len(question.strip()) <= 1000:
        raise ValueError('Use a short nonempty question')
    if type(max_completion_tokens) is not int or not 128 <= max_completion_tokens <= 1024:
        raise ValueError('Preparation supports only128..1024combined output tokens')
    return {'model': REASONING_MODEL,
            'messages': [{'role': 'user', 'content': question.strip()}],
            'reasoning_effort': 'low',
            'max_completion_tokens': max_completion_tokens,
            'stream': False}

def classify_reasoning(response):
    """Fail closed on incomplete/empty output; never retries or invents an answer."""
    choices = response.get('choices') or []
    if not choices:
        return {'state': 'error', 'answer': None}
    first = choices[0]
    reason = first.get('finish_reason')
    text = (first.get('message') or {}).get('content')
    if reason == 'length':
        return {'state': 'incomplete', 'answer': None}
    if reason != 'stop' or not isinstance(text, str) or not text.strip():
        return {'state': 'unavailable', 'answer': None}
    return {'state': 'complete', 'answer': text.strip()}

def reasoning_cost(input_tokens, combined_output_tokens):
    for count in (input_tokens, combined_output_tokens):
        if type(count) is not int or count < 0:
            raise ValueError('Token counts must be nonnegative integers')
    return (Decimal(input_tokens)*Decimal('1.25') +
            Decimal(combined_output_tokens)*Decimal('4.25'))/Decimal(1000000)
