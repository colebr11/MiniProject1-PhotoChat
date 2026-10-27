
import React, { useState, useEffect, useRef } from "react";
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
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";

import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";

// Render backend
const BACKEND_HTTP = "https://miniproject1-photochat.onrender.com";
const BACKEND_WS = "wss://miniproject1-photochat.onrender.com/ws";

export default function App() {
  // Camera states
  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();
  const [isCameraVisible, setIsCameraVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const cameraRef = useRef(null);

  // Chat and photo states
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef(null);
  const scrollViewRef = useRef(null);

  // Connect to WebSocket when app opens
  useEffect(() => {
    let active = true;
    let reconnectTimer = null;
    let socket = null;

    const connect = () => {
      if (!active) return;

      socket = new WebSocket(BACKEND_WS);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        console.log("Connected to WebSocket");
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "chat") {
            setMessages((prev) => [...prev, data]);
          } else if (data.type === "photo_selected") {
            setCurrentPhotoUrl(data.url);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socket.onclose = () => {
        if (!active) return;

        console.log("WebSocket disconnected");
        setIsConnected(false);

        // Reconnect automatically
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimer);

      if (socket) {
        socket.close();
      }

      wsRef.current = null;
    };
  }, []);

  // Open camera and request permission
  const openCamera = async () => {
    try {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission();

        if (!result.granted) {
          Alert.alert(
            "Permission Required",
            "Camera permission is needed to take photos."
          );
          return;
        }
      }

      setIsCameraVisible(true);
    } catch (error) {
      console.error("Camera permission error:", error);
    }
  };

  // Capture photo
  const takePicture = async () => {
    if (!cameraRef.current || isUploading) return;

    try {
      setIsUploading(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
      });

      setIsCameraVisible(false);

      await uploadPhoto(photo.uri);
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert("Error", "Could not capture the photo.");
    } finally {
      setIsUploading(false);
    }
  };

  // Upload photo to FastAPI
  const uploadPhoto = async (uri) => {
    try {
      const formData = new FormData();

      // Expo SDK 58 compatible file upload
      const photoFile = new File(uri);
      formData.append("file", photoFile);

      const response = await fetch(
        `${BACKEND_HTTP}/upload-photo`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();

      // Convert relative URL to full Render URL
      const fullImageUrl = `${BACKEND_HTTP}${result.url}`;

      // Display uploaded photo locally
      setCurrentPhotoUrl(fullImageUrl);

      // Broadcast photo URL to all devices
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "photo_selected",
            url: fullImageUrl,
          })
        );

        console.log("Photo shared successfully");
      } else {
        Alert.alert(
          "Photo Uploaded",
          "Photo uploaded, but chat is disconnected. Other devices may not see it."
        );
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
      Alert.alert("Upload Failed", "Could not upload the photo.");
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (!inputText.trim()) return;

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      Alert.alert("Disconnected", "WebSocket is not connected.");
      return;
    }

    const chatMessage = {
      type: "chat",
      author: "Device User",
      text: inputText.trim(),
      timestamp: new Date().toISOString(),
    };

    wsRef.current.send(JSON.stringify(chatMessage));
    setInputText("");
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Upper Section - Shared Photo */}
      <View style={styles.upperSection}>
        <Text style={styles.sectionTitle}>
          Current Shared Photo
        </Text>

        <View style={styles.photoContainer}>
          {currentPhotoUrl ? (
            <Image
              source={{ uri: currentPhotoUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <Text style={styles.placeholderText}>
              No photo selected yet. Take one!
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.cameraButton}
          onPress={openCamera}
          disabled={isUploading}
        >
          <Text style={styles.buttonText}>
            Open Camera & Upload
          </Text>
        </TouchableOpacity>

        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color="#007AFF" />
            <Text style={styles.uploadingText}>
              Uploading photo...
            </Text>
          </View>
        )}
      </View>

      {/* Lower Section - WebSocket Chat */}
      <View style={styles.lowerSection}>
        <Text style={styles.sectionTitle}>
          Real-Time Chat
        </Text>

        <Text
          style={[
            styles.connectionText,
            { color: isConnected ? "#228B22" : "#D32F2F" },
          ]}
        >
          {isConnected ? "Connected" : "Connecting..."}
        </Text>

        <ScrollView
          style={styles.chatScroll}
          ref={scrollViewRef}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({
              animated: true,
            })
          }
        >
          {messages.map((msg, index) => (
            <View key={index} style={styles.chatBubble}>
              <Text style={styles.chatAuthor}>
                {msg.author}
              </Text>

              <Text style={styles.chatText}>
                {msg.text}
              </Text>

              <Text style={styles.chatTime}>
                {msg.timestamp
                  ? new Date(msg.timestamp).toLocaleTimeString()
                  : ""}
              </Text>
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

          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
          >
            <Text style={styles.sendButtonText}>
              Send
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>

      {/* Camera Modal */}
      <Modal
        visible={isCameraVisible}
        animationType="slide"
        onRequestClose={() => setIsCameraVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* CameraView must not contain children */}
          {isCameraVisible && (
            <CameraView
              style={styles.cameraView}
              ref={cameraRef}
              facing="back"
            />
          )}

          {/* Buttons positioned above camera */}
          <View style={styles.cameraButtonRow}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setIsCameraVisible(false)}
              disabled={isUploading}
            >
              <Text style={styles.buttonText}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.captureButton]}
              onPress={takePicture}
              disabled={isUploading}
            >
              <Text style={styles.buttonText}>
                Snap Photo
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },

  upperSection: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
    textAlign: "center",
  },

  photoContainer: {
    width: "100%",
    height: 180,
    backgroundColor: "#e1e1e1",
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholderText: {
    color: "#666",
    textAlign: "center",
  },

  cameraButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },

  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  uploadingText: {
    marginLeft: 8,
    color: "#555",
  },

  lowerSection: {
    flex: 1,
    padding: 16,
  },

  connectionText: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 8,
  },

  chatScroll: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e1e1e1",
  },

  chatBubble: {
    backgroundColor: "#f0f0f0",
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },

  chatAuthor: {
    fontWeight: "bold",
    fontSize: 12,
    color: "#007AFF",
  },

  chatText: {
    fontSize: 14,
    color: "#333",
    marginVertical: 2,
  },

  chatTime: {
    fontSize: 10,
    color: "#888",
    alignSelf: "flex-end",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },

  textInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
  },

  sendButton: {
    backgroundColor: "#34C759",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 6,
    marginLeft: 8,
  },

  sendButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },

  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
  },

  cameraView: {
    flex: 1,
  },

  cameraButtonRow: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },

  cancelButton: {
    backgroundColor: "#FF3B30",
  },

  captureButton: {
    backgroundColor: "#34C759",
  },
});
