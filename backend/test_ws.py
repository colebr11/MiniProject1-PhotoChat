# file simply for demonstrating that WebSocket backend works

import asyncio
import json
import websockets

async def test():
    url = "wss://miniproject1-photochat.onrender.com/ws"

    async with websockets.connect(url) as client1:
        async with websockets.connect(url) as client2:
            message = {
                "type": "photo_selected",
                "url": "https://miniproject1-photochat.onrender.com/images/test.jpg"
            }

            await client1.send(json.dumps(message))

            response1 = await client1.recv()
            response2 = await client2.recv()

            print("Device 1 received:", response1)
            print("Device 2 received:", response2)

asyncio.run(test())
