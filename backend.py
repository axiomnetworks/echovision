"""CPU-only smoke test. No model, images, tracking, or inference."""
import os
import secrets
import modal
from fastapi import FastAPI, Header, HTTPException

app = modal.App('echovision')
web_app = FastAPI()

@web_app.get('/')
def health():
    return {'status': 'ok'}

@web_app.get('/auth-test')
def auth_test(x_demo_token: str = Header(default='')):
    expected = os.environ.get('DEMO_TOKEN', '')
    if not expected or not secrets.compare_digest(x_demo_token, expected):
        raise HTTPException(status_code=401, detail='unauthorized')
    return {'status': 'auth works'}

@app.function(
    image=modal.Image.debian_slim(python_version='3.11').pip_install('fastapi[standard]'),
    secrets=[modal.Secret.from_name('echovision-auth')],
    cpu=0.25, memory=256, max_containers=1, scaledown_window=30, timeout=30,
)
@modal.asgi_app()
def fastapi_app():
    return web_app
