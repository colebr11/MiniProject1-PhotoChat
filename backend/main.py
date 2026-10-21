
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# for photo storage
import os
import shutil
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import File, UploadFile
from fastapi.staticfiles import StaticFiles

# for websocket 
from fastapi import WebSocket, WebSocketDisconnect



app = FastAPI()

# Allow the React Native app to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Directory for uploaded photos
UPLOAD_DIR = "/tmp/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Make uploaded images accessible through a URL
app.mount("/images", StaticFiles(directory=UPLOAD_DIR), name="images")


# Basic route to verify the server is working
@app.get("/")
def home():
    return {"message": "Photo Chat Backend is running!"}


@app.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...)):
    # Generate a unique filename
    filename = f"{uuid4().hex}_{os.path.basename(file.filename or 'photo.jpg')}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save the uploaded photo
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return photo information
    return {
        "filename": filename,
        "url": f"/images/{filename}",
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }

# return list of all uploaded photos
@app.get("/photos")
def get_photos():
    photos = []

    for filename in os.listdir(UPLOAD_DIR):
        if os.path.isfile(os.path.join(UPLOAD_DIR, filename)):
            photos.append({
                "filename": filename,
                "url": f"/images/{filename}"
            })

    return {"photos": photos}


# Manage connected WebSocket clients
class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in self.active_connections:
            await connection.send_json(data)


manager = ConnectionManager()


# WebSocket endpoint for chat and photo sharing
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast(data)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
