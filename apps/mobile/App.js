const { useEffect, useMemo, useState } = require('react');
const {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} = require('react-native');
const { parseIncomingOffer } = require('./src/offer');
const { createDeviceStore } = require('./src/storage');
const { openRemoteSession } = require('./src/connect');
const { foldMuxMessage, rpcEnvelope, respondEnvelope, sessionTitle } = require('./src/fold');
const { ScanButton } = require('./src/scanner');

const store = createDeviceStore();

function initialOfferText() {
  if (typeof window !== 'undefined' && window.location?.hash) {
    return window.location.hash;
  }
  return '';
}

function App() {
  const [offerText, setOfferText] = useState(initialOfferText);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState('');
  const [chat, setChat] = useState({ events: [], approvals: [] });
  const offer = useMemo(() => {
    try {
      return parseIncomingOffer(offerText);
    } catch {
      return null;
    }
  }, [offerText]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }
    let cancelled = false;
    const pump = async () => {
      while (!cancelled) {
        const frame = await session.next();
        if (frame.type === 'http_response' && frame.id === 'list') {
          setSessions(frame.body?.result?.value?.items || []);
        } else if (frame.type === 'http_response' && frame.id === 'create') {
          const id = frame.body?.result?.value?.sessionId;
          if (id) setActiveId(id);
        } else if (frame.type === 'ws_message') {
          setChat((current) => foldMuxMessage(current, frame.data));
        }
      }
    };
    pump().catch((err) => {
      if (!cancelled) setError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function connect() {
    setError('');
    if (!offer) {
      setError('配对链接无效');
      return;
    }
    const device = await store.load();
    const next = await openRemoteSession({ offer, device });
    await store.save(next.device);
    setSession(next);
    next.send({
      type: 'http_request',
      id: 'list',
      path: '/api/session.list',
      body: rpcEnvelope('session.list', {}),
    });
    next.send({ type: 'ws_open', id: 'mux', path: '/api/events.mux' });
  }

  function sendPrompt() {
    if (!session || !activeId || !draft.trim()) {
      return;
    }
    session.send({
      type: 'http_request',
      id: 'prompt',
      path: '/api/session.prompt',
      body: rpcEnvelope('session.prompt', {
        sessionId: activeId,
        mode: 'queue',
        content: [{ type: 'text', text: draft.trim() }],
      }),
    });
    setChat((current) => ({
      ...current,
      events: [...current.events, { role: 'user', text: draft.trim() }],
    }));
    setDraft('');
  }

  function resolveApproval(item, outcome) {
    if (!session) {
      return;
    }
    session.send({
      type: 'http_request',
      id: `respond-${item.rpcId}`,
      path: '/api/respond',
      body: respondEnvelope(item.rpcId, {
        sessionId: item.sessionId,
        approvalId: item.approvalId,
        outcome,
      }),
    });
    setChat((current) => ({
      ...current,
      approvals: current.approvals.filter((row) => row.rpcId !== item.rpcId),
    }));
  }

  if (!session) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Deepseek Harness 远程办公</Text>
        <Text style={styles.hint}>粘贴桌面设置里的配对链接，或用 Android 扫描二维码。</Text>
        <ScanButton onScan={setOfferText} />
        <TextInput
          style={styles.input}
          multiline
          value={offerText}
          onChangeText={setOfferText}
          placeholder="https://app.example/#offer=..."
          placeholderTextColor="#7a8494"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={() => { void connect(); }}>
          <Text style={styles.buttonText}>连接电脑</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>会话</Text>
      <ScrollView horizontal style={styles.row}>
        {sessions.map((item) => (
          <Pressable
            key={item.sessionId}
            style={[styles.chip, activeId === item.sessionId ? styles.chipOn : null]}
            onPress={() => setActiveId(item.sessionId)}
          >
            <Text style={styles.chipText}>{sessionTitle(item)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.chip}
          onPress={() => {
            session.send({
              type: 'http_request',
              id: 'create',
              path: '/api/session.create',
              body: rpcEnvelope('session.create', {}),
            });
          }}
        >
          <Text style={styles.chipText}>新会话</Text>
        </Pressable>
      </ScrollView>
      <ScrollView style={styles.chat}>
        {chat.events.map((event, index) => (
          <Text key={`${event.role}-${index}`} style={event.role === 'user' ? styles.user : styles.assistant}>
            {event.text}
          </Text>
        ))}
        {chat.approvals.map((item) => (
          <View key={item.rpcId} style={styles.approval}>
            <Text style={styles.assistant}>{item.tool} {item.detail}</Text>
            <View style={styles.row}>
              <Pressable style={styles.button} onPress={() => resolveApproval(item, 'allowed-once')}>
                <Text style={styles.buttonText}>允许一次</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={() => resolveApproval(item, 'rejected')}>
                <Text style={styles.buttonText}>拒绝</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder="发给本机 Harness…"
        placeholderTextColor="#7a8494"
      />
      <Pressable style={styles.button} onPress={sendPrompt}>
        <Text style={styles.buttonText}>发送</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#11161c', padding: 20, gap: 12 },
  title: { color: '#f4f7fb', fontSize: 22, fontWeight: '600' },
  hint: { color: '#9aa6b5', fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#1b222c',
    color: '#f4f7fb',
    padding: 12,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#3d8bfd',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: '#fff', fontSize: 14 },
  error: { color: '#ff8a8a' },
  row: { flexGrow: 0 },
  chip: {
    backgroundColor: '#1b222c',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#3d8bfd' },
  chipText: { color: '#f4f7fb' },
  chat: { flex: 1 },
  user: { color: '#d7e7ff', marginBottom: 8 },
  assistant: { color: '#f4f7fb', marginBottom: 8 },
  approval: { backgroundColor: '#1b222c', borderRadius: 12, padding: 12, gap: 8, marginBottom: 8 },
});

module.exports = { App, default: App };
