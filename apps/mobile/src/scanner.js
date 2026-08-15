const { useState } = require('react');
const { Pressable, StyleSheet, Text, View } = require('react-native');

function ScanButton({ onScan }) {
  const [open, setOpen] = useState(false);
  let CameraView = null;
  try {
    ({ CameraView } = require('expo-camera'));
  } catch {
    return null;
  }
  if (!CameraView) {
    return null;
  }
  if (!open) {
    return (
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.text}>扫描二维码</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.cameraBox}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          setOpen(false);
          onScan(data);
        }}
      />
      <Pressable style={styles.button} onPress={() => setOpen(false)}>
        <Text style={styles.text}>取消</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#1b222c',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: { color: '#f4f7fb' },
  cameraBox: { height: 240, gap: 8 },
  camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
});

module.exports = { ScanButton };
