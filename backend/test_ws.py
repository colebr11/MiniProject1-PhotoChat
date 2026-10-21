# file simply for demonstrating that WebSocket backend works

import asyncio
import json
import websockets

async def test():
    url = "ws://127.0.0.1:8000/ws"

    async with websockets.connect(url) as client1:
        async with websockets.connect(url) as client2:
            message = {
                "type": "photo_selected",
                "url": "http://127.0.0.1:8000/images/test.jpg"
            }

            await client1.send(json.dumps(message))

            response1 = await client1.recv()
            response2 = await client2.recv()

            print("Device 1 received:", response1)
            print("Device 2 received:", response2)

asyncio.run(test())
