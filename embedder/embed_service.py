# ─────────────────────────────────────────────────────────────
# RGPVMate Embedder Service — Python Flask + SentenceTransformers
# ─────────────────────────────────────────────────────────────
"""
This microservice handles two responsibilities:
  1. /embed          — converts text → 384-dim vectors (all-MiniLM-L6-v2)
  2. /extract-text   — extracts raw text from PDFs with OCR fallback:
                         • Text PDFs  → PyMuPDF (fast, exact)
                         • Scanned PDFs → pytesseract OCR (slower, image→text)
"""

import os
import sys
import time
import base64
import gc
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

# ── Optional OCR dependencies ─────────────────────────────────
# Gracefully degrade if not installed — warn instead of crash.
try:
    import fitz  # PyMuPDF — fast text extraction for text-based PDFs
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("[WARN] PyMuPDF not installed. Run: pip install pymupdf", file=sys.stderr)

POPPLER_PATH = None
TESSERACT_CMD = None
TESSERACT_AVAILABLE = False
POPPLER_AVAILABLE = False

try:
    import pytesseract
    from pdf2image import convert_from_bytes
    from PIL import Image

    # 1. Resolve Tesseract executable path on Windows
    for p in [
        r"E:\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"
    ]:
        if os.path.exists(p):
            TESSERACT_CMD = p
            break
    
    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    
    try:
        pytesseract.get_tesseract_version()
        TESSERACT_AVAILABLE = True
    except Exception:
        TESSERACT_AVAILABLE = False

    # 2. Resolve Poppler bin path on Windows (look in Downloads and root)
    for p in [
        r"C:\Users\91626\Downloads\Release-26.02.0-0\poppler-26.02.0\Library\bin",
        r"C:\poppler\Library\bin"
    ]:
        if os.path.exists(p) and (os.path.exists(os.path.join(p, "pdfinfo.exe")) or os.path.exists(os.path.join(p, "pdftoppm.exe"))):
            POPPLER_PATH = p
            break

    import subprocess
    try:
        # Check if pdfinfo is in the system PATH
        subprocess.run(["pdfinfo", "-v"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        POPPLER_AVAILABLE = True
    except FileNotFoundError:
        POPPLER_AVAILABLE = (POPPLER_PATH is not None)

    OCR_AVAILABLE = TESSERACT_AVAILABLE and POPPLER_AVAILABLE
    
    if OCR_AVAILABLE:
        print(f"[INFO] OCR is fully available. Tesseract: {TESSERACT_CMD or 'in PATH'}, Poppler: {POPPLER_PATH or 'in PATH'}")
    else:
        print("[WARN] OCR is not fully available on this system because required binaries are missing:", file=sys.stderr)
        if not TESSERACT_AVAILABLE:
            print("[WARN]   • Tesseract OCR is not installed or not in PATH.", file=sys.stderr)
            print("[WARN]     Please run your downloaded installer: C:\\Users\\91626\\Downloads\\tesseract-ocr-w64-setup-5.5.0.20241111.exe", file=sys.stderr)
        if not POPPLER_AVAILABLE:
            print("[WARN]   • Poppler is not found.", file=sys.stderr)
            print("[WARN]     Please ensure Poppler is extracted to C:\\poppler or downloaded to your downloads folder.", file=sys.stderr)
        print("[WARN] Scanned PDFs will be gracefully skipped during ingestion until binaries are set up.", file=sys.stderr)
except ImportError:
    OCR_AVAILABLE = False
    print("[WARN] OCR Python packages not installed. Run: pip install pytesseract pdf2image Pillow", file=sys.stderr)

# Initialize Flask App
app = Flask(__name__)
CORS(app)  # Enable CORS for robust cross-origin networking

# ── Load Model ────────────────────────────────────────────────
MODEL_NAME = 'all-MiniLM-L6-v2'
print(f"[INFO] Loading SentenceTransformer model: '{MODEL_NAME}'...")
start_time = time.time()

try:
    # On first run, this downloads ~90MB from HuggingFace to ~/.cache/huggingface/
    # On subsequent runs, it loads from cache in < 1 second.
    model = SentenceTransformer(MODEL_NAME)
    load_duration = time.time() - start_time
    print(f"[SUCCESS] Model loaded successfully in {load_duration:.2f} seconds!")
    print(f"[INFO] Device: {model.device}")
except Exception as e:
    print(f"[ERROR] Failed to load SentenceTransformer model: {e}", file=sys.stderr)
    sys.exit(1)

# ── Routes ───────────────────────────────────────────────────

@app.route('/', methods=['GET'])
@app.route('/health', methods=['GET'])
def health_check():
    """
    Service health and diagnostics endpoint.
    """
    return jsonify({
        "status": "healthy",
        "service": "rgpvmate-embedder",
        "model": MODEL_NAME,
        "device": str(model.device),
        "dimensions": 384,
        "timestamp": time.time()
    }), 200

@app.route('/embed', methods=['POST'])
def embed():
    """
    Generates 384-dimensional semantic embeddings for input text.
    Accepts:
      - A single text string: {"text": "What is the syllabus?"}
      - A list of text strings: {"text": ["Hello", "World"]}
    Returns:
      - Single text: {"vector": [...]}
      - List of texts: {"vectors": [[...], [...]]}
    """
    data = request.get_json(silent=True)
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' field in JSON request body."}), 400
    
    text_input = data['text']
    
    try:
        if isinstance(text_input, list):
            # Batch embedding generation
            vectors = model.encode(text_input)
            # Convert numpy array to standard list of lists
            vectors_list = [v.tolist() for v in vectors]
            return jsonify({
                "model": MODEL_NAME,
                "vectors": vectors_list
            }), 200
        elif isinstance(text_input, str):
            # Single text embedding generation
            vector = model.encode(text_input)
            # Convert numpy array to standard float list
            return jsonify({
                "model": MODEL_NAME,
                "vector": vector.tolist()
            }), 200
        else:
            return jsonify({"error": "'text' field must be a string or a list of strings."}), 400
            
    except Exception as e:
        print(f"[ERROR] Embedding failed: {e}", file=sys.stderr)
        return jsonify({"error": f"Internal server error: {e}"}), 500


@app.route('/extract-text', methods=['POST'])
def extract_text():
    """
    Extracts raw text from a PDF with automatic OCR fallback.

    Accepts:
      { "pdf_b64": "<base64-encoded PDF bytes>" }

    Returns:
      {
        "text":   "<extracted text>",
        "method": "text" | "ocr" | "none",
        "pages":  <int>,
        "length": <int>
      }

    Method priority:
      1. PyMuPDF  — fast, exact text extraction for digital PDFs
      2. Tesseract OCR — image-to-text for scanned PDFs (if installed)
      3. "none"   — returns empty text with a warning (OCR not installed)
    """
    data = request.get_json(silent=True)
    if not data or 'pdf_b64' not in data:
        return jsonify({"error": "Missing 'pdf_b64' field in request body."}), 400

    # ── Decode base64 PDF bytes ───────────────────────────────
    try:
        pdf_bytes = base64.b64decode(data['pdf_b64'])
    except Exception:
        return jsonify({"error": "Invalid base64 encoding for 'pdf_b64'."}), 400

    num_pages = 0

    # ── Step 1: PyMuPDF text extraction (fast path) ───────────
    if PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            num_pages = len(doc)
            text_parts = [page.get_text() for page in doc]
            doc.close()
            full_text = "\n".join(text_parts).strip()
        except Exception as e:
            print(f"[WARN] PyMuPDF extraction failed: {e}", file=sys.stderr)
            full_text = ""
    else:
        full_text = ""

    disable_ocr = data.get('disable_ocr', False)
    is_text_pdf = len(full_text.strip()) >= 10

    # ── Step 2: OCR fallback for scanned PDFs ────────────────
    # Trigger OCR if extracted text is too short (likely scanned) and OCR is not disabled.
    if not is_text_pdf:
        if disable_ocr:
            method = "none"
        elif not OCR_AVAILABLE:
            print("[WARN] Scanned PDF detected but OCR not installed.", file=sys.stderr)
            return jsonify({
                "text": full_text,
                "method": "none",
                "pages": num_pages,
                "length": len(full_text),
                "warning": (
                    "Scanned PDF detected but OCR is not installed. "
                    "To enable OCR: pip install pytesseract pdf2image Pillow "
                    "and install Tesseract from https://github.com/UB-Mannheim/tesseract/wiki"
                )
            }), 200
        else:
            try:
                print(f"[INFO] Scanned PDF detected — running OCR ({num_pages} pages)...")
                start = time.time()

                ocr_parts = []
                for i in range(num_pages):
                    # Convert only one page at a time to minimize memory consumption
                    page_images = convert_from_bytes(
                        pdf_bytes,
                        dpi=200,
                        first_page=i+1,
                        last_page=i+1,
                        poppler_path=POPPLER_PATH
                    )
                    if page_images:
                        img = page_images[0]
                        page_text = pytesseract.image_to_string(img, lang='eng')
                        ocr_parts.append(page_text)
                        # Release image memory immediately
                        img.close()
                        del img
                        del page_images
                    print(f"[INFO]   OCR page {i+1}/{num_pages} done")

                full_text = "\n".join(ocr_parts).strip()
                elapsed = time.time() - start
                print(f"[INFO] OCR complete in {elapsed:.1f}s — {len(full_text)} chars extracted")
                method = "ocr"

            except Exception as e:
                print(f"[ERROR] OCR failed: {e}", file=sys.stderr)
                return jsonify({"error": f"OCR processing failed: {e}"}), 500
    else:
        method = "text"

    # Free memory buffers before responding
    del pdf_bytes
    if data and 'pdf_b64' in data:
        data['pdf_b64'] = None
    gc.collect()

    return jsonify({
        "text":   full_text,
        "method": method,
        "pages":  num_pages,
        "length": len(full_text)
    }), 200


# ── Entry Point ──────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    print("=============================================================")
    print(f" Starting RGPVMate Embedder on http://localhost:{port}")
    print(f" OCR available : {OCR_AVAILABLE}")
    print(f" PyMuPDF       : {PYMUPDF_AVAILABLE}")
    print("=============================================================")

    # threaded=True handles concurrent requests efficiently
    app.run(host='0.0.0.0', port=port, debug=debug, threaded=True)
