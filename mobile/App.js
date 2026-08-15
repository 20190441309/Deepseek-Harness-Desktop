import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const STORAGE_KEY = 'dsh.mobile.lastUrl';

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export default function App() {
  const [draft, setDraft] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        setDraft(stored);
      }
    }).catch(() => {});
  }, []);

  const connect = () => {
    const next = normalizeUrl(draft);
    if (!next) {
      setError('需要 http:// 或 https:// 开头的配对链接');
      return;
    }
    setError('');
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    if (Platform.OS === 'web') {
      window.location.assign(next);
      return;
    }
    setUrl(next);
  };

  if (url) {
    return (
      <View style={styles.webRoot}>
        <SafeAreaView style={styles.webBar}>
          <Pressable onPress={() => { setUrl(''); }} style={styles.back}>
            <Text style={styles.backText}>断开</Text>
          </Pressable>
          <Text style={styles.webTitle} numberOfLines={1}>{url}</Text>
        </SafeAreaView>
        <WebView
          source={{ uri: url }}
          originWhitelist={['http://*', 'https://*']}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          style={styles.webview}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.kicker}>手机远程</Text>
        <Text style={styles.title}>打开桌面端手机弹窗给出的配对链接</Text>
        <Text style={styles.lead}>
          和电脑连同一个 Wi-Fi，或使用服务器中继。用系统相机扫桌面侧栏手机按钮里的二维码，再把地址贴到这里。打开的是同一套官方页。
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.x.x:3180/#offer=..."
          placeholderTextColor="#8b8b93"
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={connect} style={styles.button}>
          <Text style={styles.buttonText}>连接</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111113',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    gap: 12,
  },
  kicker: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  title: {
    color: '#f4f4f5',
    fontSize: 28,
    fontWeight: '600',
  },
  lead: {
    color: '#d4d4d8',
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#111113',
    fontSize: 15,
    fontWeight: '600',
  },
  webRoot: {
    flex: 1,
    backgroundColor: '#111113',
  },
  webBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#111113',
  },
  back: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    color: '#f4f4f5',
    fontSize: 15,
  },
  webTitle: {
    flex: 1,
    color: '#a1a1aa',
    fontSize: 12,
  },
  webview: {
    flex: 1,
    backgroundColor: '#111113',
  },
});
