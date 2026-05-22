# ─────────────────────────────────────────────────────────────
# RGPVMate Embedder Service — Python Flask + SentenceTransformers
# ─────────────────────────────────────────────────────────────
"""
This microservice has a single purpose: receive text inputs and return
384-dimensional vector embeddings using the all-MiniLM-L6-v2 model.
"""

import os
import sys
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

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

# ── Entry Point ──────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    
    print("=============================================================")
    print(f" Starting RGPVMate Embedder on http://localhost:{port}")
    print("=============================================================")
    
    # Run the server
    # threaded=True handles concurrent incoming API requests efficiently
    app.run(host='0.0.0.0', port=port, debug=debug, threaded=True)
