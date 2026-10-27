import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Replace with your actual deployed Render backend URL
const BACKEND_HTTP = "https://miniproject1-photochat-zq1l.onrender.com/";
const BACKEND_WS = "wss://miniproject1-photochat-zq1l.onrender.com//ws";

export default function App() {
  // Camera & Permission States
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCameraVisible, setIsCameraVisible] = useState(false);
  const cameraRef = useRef(null);

  // App Data States
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const wsRef = useRef(null);
  const scrollViewRef = useRef(null);

  // Setup WebSocket connection on mount
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    wsRef.current = new WebSocket(BACKEND_WS);

    wsRef.current.onopen = () => {
      console.log("Connected to WebSocket");
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle incoming chat messages
        if (data.type === "chat") {
          setMessages((prev) => [...prev, data]);
        } 
        // Handle synchronized photo updates across devices
        else if (data.type === "photo_selected") {
          setCurrentPhotoUrl(data.url);
        }
      } catch (error) {
        console.error("Error parsing WS message:", error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected. Reconnecting...");
      setTimeout(connectWebSocket, 3000);
    };
  };

  // Take picture and upload to backend
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
        setIsCameraVisible(false);
        await uploadPhoto(photo.uri);
      } catch (error) {
        console.error("Failed to take picture:", error);
      }
    }
  };

  const uploadPhoto = async (uri) => {
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || "photo.jpg";
      
      // Append file for multipart/form-data upload
      formData.append("file", {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        type: "image/jpeg",
        name: filename,
      });

      const response = await fetch(`${BACKEND_HTTP}/upload-photo`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const result = await response.json();
      if (response.ok) {
        const fullImageUrl = `${BACKEND_HTTP}${result.url}`;
        
        // Update local state
        setCurrentPhotoUrl(fullImageUrl);

        // Broadcast photo selection over WebSocket to sync other devices
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "photo_selected",
            url: fullImageUrl
          }));
        }
      } else {
        console.error("Upload failed:", result);
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
    }
  };

  // Send Chat Message
  const sendMessage = () => {
    if (!inputText.trim()) return;

    const chatMessage = {
      type: "chat",
      author: "Device User",
      text: inputText.trim(),
      timestamp: new Date().toISOString()
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(chatMessage));
      setInputText("");
    } else {
      alert("WebSocket is not connected.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* UPPER SECTION: Photo Display & Camera Trigger */}
      <View style={styles.upperSection}>
        <Text style={styles.sectionTitle}>Current Shared Photo</Text>
        <View style={styles.photoContainer}>
          {currentPhotoUrl ? (
            <Image source={{ uri: currentPhotoUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={styles.placeholderText}>No photo selected yet. Take one!</Text>
          )}
        </View>

        <TouchableOpacity 
          style={styles.cameraButton} 
          onPress={async () => {
            if (!cameraPermission || !cameraPermission.granted) {
              const permissionResult = await requestCameraPermission();
              if (!permissionResult.granted) {
                alert("Camera permission is required to take photos.");
                return;
              }
            }
            setIsCameraVisible(true);
          }}
        >
          <Text style={styles.buttonText}>Open Camera & Upload</Text>
        </TouchableOpacity>
      </View>

      {/* LOWER SECTION: Real-Time WebSocket Chat */}
      <View style={styles.lowerSection}>
        <Text style={styles.sectionTitle}>Real-Time Chat</Text>
        
        <ScrollView 
          style={styles.chatScroll} 
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, index) => (
            <View key={index} style={styles.chatBubble}>
              <Text style={styles.chatAuthor}>{msg.author}</Text>
              <Text style={styles.chatText}>{msg.text}</Text>
              <Text style={styles.chatTime}>{new Date(msg.timestamp).toLocaleTimeString()}</Text>
            </View>
          ))}
        </ScrollView>

        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.inputContainer}
        >
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#888"
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>

      {/* Camera Modal View */}
      <Modal visible={isCameraVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <CameraView style={styles.cameraView} ref={cameraRef}>
            <View style={styles.cameraButtonRow}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setIsCameraVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.captureButton]} 
                onPress={takePicture}
              >
                <Text style={styles.buttonText}>Snap Photo</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  upperSection: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  photoContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#e1e1e1',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderText: {
    color: '#666',
    textAlign: 'center',
  },
  cameraButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  lowerSection: {
    flex: 1,
    padding: 16,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  chatBubble: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  chatAuthor: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#007AFF',
  },
  chatText: {
    fontSize: 14,
    color: '#333',
    marginVertical: 2,
  },
  chatTime: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
  },
  sendButton: {
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 6,
    marginLeft: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cameraButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
  },
  captureButton: {
    backgroundColor: '#34C759',
  },
});