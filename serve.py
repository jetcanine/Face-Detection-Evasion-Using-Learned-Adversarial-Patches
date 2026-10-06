"""Production WSGI entry point, suitable for Windows or Linux behind HTTPS."""
import os
from waitress import serve
from app import app

if __name__ == "__main__":
    serve(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
