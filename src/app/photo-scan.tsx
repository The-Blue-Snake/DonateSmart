import { Colors } from '@/constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PhotoScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionMessage}>
          DonateSmart uses your camera to help identify items without barcodes.
        </Text>

        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Enable Camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleCapture = async () => {
    setIsAnalyzing(true);

    // This is a placeholder until real image classification is wired in.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    setIsAnalyzing(false);
    router.replace({ pathname: '/manual-entry', params: { prefill: '' } });
  };

  return (
    <View style={styles.blackContainer}>
      <CameraView ref={cameraRef} style={styles.camera} />

      {isAnalyzing ? (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.analyzingText}>Identifying item…</Text>
        </View>
      ) : (
        <View style={styles.captureBar}>
          <Pressable style={styles.captureButton} onPress={handleCapture} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blackContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: Colors.text,
  },
  permissionMessage: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: Colors.text,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    color: Colors.card,
    fontSize: 16,
    fontWeight: '600',
  },
  captureBar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: Colors.accent,
    borderWidth: 5,
    borderColor: Colors.accentDark,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  analyzingText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});