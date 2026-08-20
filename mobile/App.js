import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Text style={styles.kicker}>手机远程</Text>
      <Text style={styles.title}>请用系统浏览器打开桌面二维码链接</Text>
      <Text style={styles.lead}>
        这一版的客户端是手机网页。扫码后走独立 SPA，不套官方四栏页。应用内扫码会在下一版做。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f6f7',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  kicker: {
    color: '#81858c',
    fontSize: 13,
  },
  title: {
    color: '#0f1115',
    fontSize: 22,
    fontWeight: '600',
  },
  lead: {
    color: '#61656b',
    fontSize: 15,
    lineHeight: 22,
  },
});
