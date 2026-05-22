import json
import urllib.request
import urllib.error
import time

BASE_URL = "http://localhost:5000"

def run_test():
    print("=============================================================")
    print(" Running End-to-End Embedder Verification Tests")
    print("=============================================================")

    # Test 1: GET /health
    print("\nTest 1: GET /health")
    try:
        req = urllib.request.Request(f"{BASE_URL}/health", method="GET")
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(" SUCCESS: /health endpoint reached!")
            print(f"   Status:     {data.get('status')}")
            print(f"   Model:      {data.get('model')}")
            print(f"   Device:     {data.get('device')}")
            print(f"   Dimensions: {data.get('dimensions')}")
            
            assert data.get('status') == 'healthy'
            assert data.get('dimensions') == 384
    except Exception as e:
        print(f" FAILED Test 1: {e}")
        return False

    # Test 2: POST /embed (Single Text)
    print("\nTest 2: POST /embed (Single Text)")
    payload = {"text": "What is Rajiv Gandhi Proudyogiki Vishwavidyalaya attendance rule?"}
    try:
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/embed", 
            data=data_bytes, 
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            vector = data.get('vector')
            print(" SUCCESS: POST /embed returned single embedding!")
            print(f"   Model used:     {data.get('model')}")
            print(f"   Vector type:    {type(vector)}")
            print(f"   Vector length:  {len(vector) if vector else 'None'}")
            print(f"   First 5 values: {vector[:5] if vector else []}")
            
            assert isinstance(vector, list)
            assert len(vector) == 384
            assert all(isinstance(x, (int, float)) for x in vector)
    except Exception as e:
        print(f" FAILED Test 2: {e}")
        return False

    # Test 3: POST /embed (Batch/List of Texts)
    print("\nTest 3: POST /embed (Batch Text)")
    batch_payload = {"text": [
        "First year CSE syllabus for RGPV",
        "How to apply for backlog condonation?"
    ]}
    try:
        data_bytes = json.dumps(batch_payload).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/embed", 
            data=data_bytes, 
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            vectors = data.get('vectors')
            print(" SUCCESS: POST /embed returned batch embeddings!")
            print(f"   Number of vectors: {len(vectors) if vectors else 'None'}")
            
            assert isinstance(vectors, list)
            assert len(vectors) == 2
            assert len(vectors[0]) == 384
            assert len(vectors[1]) == 384
    except Exception as e:
        print(f" FAILED Test 3: {e}")
        return False

    print("\n ALL TESTS PASSED SUCCESSFULLY! The Python embedder is 100% compliant.")
    print("=============================================================")
    return True

if __name__ == '__main__':
    run_test()
