#Flask entry point. Camera frames and pattern learning stay in the browser.#
#@Jetcanine on github#
import mimetypes
import os
from flask import Flask, render_template

# Ensure portable WASM serving on Windows and Linux.
mimetypes.add_type("application/wasm", ".wasm")


def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
