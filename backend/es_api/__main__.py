import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("es_api.main:app_factory", factory=True, host="127.0.0.1", port=int(os.environ.get("ES_API_PORT", "8000")))
