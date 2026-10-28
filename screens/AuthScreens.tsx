import React, { useRef, useState, useEffect } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, Pressable, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { T, Btn, NeuInput, Neu, IconBtn, Screen } from '../components/ui';
import { ZeroidLogo } from '../lib/icons';
import { useTheme, R } from '../lib/theme';
import { login, loginGoogle, register, resetPassword, verifyEmail, sendVerification, logout, useStore } from '../lib/store';
import { googleAuthConfigured } from '../lib/firebase';

function AuthShell({ children, title, subtitle, back }: { children: React.ReactNode; title: string; subtitle: string; back?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30, paddingHorizontal: 26, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {back && (
            <View style={{ marginBottom: 10 }}>
              <IconBtn icon="chevron-back" onPress={() => nav.goBack()} />
            </View>
          )}
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', marginTop: back ? 0 : 26, marginBottom: 30 }}>
            <ZeroidLogo size={92} />
            <T v="h1" style={{ marginTop: 20, textAlign: 'center' }}>
              {title}
            </T>
            <T v="sub" style={{ marginTop: 6, textAlign: 'center', maxWidth: 300 }}>
              {subtitle}
            </T>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: 16 }}>
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ErrorText({ msg, ok }: { msg: string; ok?: boolean }) {
  const t = useTheme();
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 6 }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={ok ? t.success : t.danger} />
      <T v="sub" color={ok ? t.success : t.danger} style={{ flex: 1 }}>
        {msg}
      </T>
    </View>
  );
}

function PwToggle({ show, setShow }: { show: boolean; setShow: (b: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => setShow(!show)} hitSlop={10} accessibilityLabel="Tampilkan password">
      <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={t.faint} />
    </Pressable>
  );
}

export function LoginScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const pwRef = useRef<TextInput>(null);

  const submit = async () => {
    setErr('');
    setLoading(true);
    const r = await login(email, pw);
    setLoading(false);
    if (!r.ok) setErr(r.error ?? 'Gagal masuk');
  };

  const google = async () => {
    setErr('');
    setGLoading(true);
    const r = await loginGoogle();
    setGLoading(false);
    if (!r.ok) setErr(r.error ?? 'Gagal masuk dengan Google');
  };

  return (
    <AuthShell title="Zeroid WhatsApp" subtitle="Chat, telepon & berbagi momen — cepat, aman, dan elegan.">
      <NeuInput icon="mail" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} />
      <NeuInput ref={pwRef} icon="lock-closed" placeholder="Password" value={pw} onChangeText={setPw} secureTextEntry={!show} returnKeyType="go" onSubmitEditing={() => submit()} right={<PwToggle show={show} setShow={setShow} />} />
      <Pressable onPress={() => nav.navigate('Forgot')} style={{ alignSelf: 'flex-end', paddingHorizontal: 6 }}>
        <T v="sub" color={t.accent} style={{ fontWeight: '600' }}>
          Lupa password?
        </T>
      </Pressable>
      <ErrorText msg={err} />
      <Btn title="Masuk" icon="log-in" onPress={() => submit()} loading={loading} />
      {googleAuthConfigured && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
            <T v="caption">atau</T>
            <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
          </View>
          <Btn title="Masuk dengan Google" variant="neu" icon="logo-google" onPress={google} loading={gLoading} />
        </>
      )}
      <Btn title="Buat akun baru" variant="ghost" onPress={() => nav.navigate('Register')} />
    </AuthShell>
  );
}

export function RegisterScreen() {
  const [name, setName] = useState('');
  const [uname, setUname] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const t = useTheme();
  const strength = Math.min(4, (pw.length >= 6 ? 1 : 0) + (/[A-Z]/.test(pw) ? 1 : 0) + (/\d/.test(pw) ? 1 : 0) + (/[^\w]/.test(pw) ? 1 : 0));

  const submit = async () => {
    setErr('');
    if (pw !== pw2) return setErr('Konfirmasi password tidak sama.');
    if (!agree) return setErr('Setujui ketentuan layanan terlebih dulu.');
    setLoading(true);
    const r = await register(name, email, pw, uname);
    setLoading(false);
    if (!r.ok) setErr(r.error ?? 'Gagal mendaftar');
  };

  return (
    <AuthShell back title="Buat Akun" subtitle="Daftar gratis dan mulai ngobrol dengan teman-temanmu.">
      <NeuInput icon="person" placeholder="Nama tampilan" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" maxLength={40} />
      <NeuInput icon="at" placeholder="Username (agar bisa dicari)" value={uname} onChangeText={(s) => setUname(s.toLowerCase().replace(/\s/g, ''))} autoCapitalize="none" autoCorrect={false} maxLength={20} returnKeyType="next" />
      <NeuInput icon="mail" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
      <NeuInput icon="lock-closed" placeholder="Password (min. 6 karakter)" value={pw} onChangeText={setPw} secureTextEntry={!show} right={<PwToggle show={show} setShow={setShow} />} />
      {pw.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < strength ? [t.danger, t.warning, t.accent, t.success][strength - 1] : t.border }} />
          ))}
        </View>
      )}
      <NeuInput icon="shield-checkmark" placeholder="Konfirmasi password" value={pw2} onChangeText={setPw2} secureTextEntry={!show} returnKeyType="done" onSubmitEditing={submit} />
      <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }}>
        <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={t.accent} />
        <T v="sub" style={{ flex: 1 }}>
          Saya menyetujui Ketentuan Layanan & Kebijakan Privasi Zeroid.
        </T>
      </Pressable>
      <ErrorText msg={err} />
      <Btn title="Daftar" icon="person-add" onPress={submit} loading={loading} />
    </AuthShell>
  );
}

export function ForgotScreen() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigation();
  const submit = async () => {
    setLoading(true);
    const r = await resetPassword(email);
    setLoading(false);
    setMsg({ ok: r.ok, text: r.message });
  };
  return (
    <AuthShell back title="Reset Password" subtitle="Masukkan email akunmu. Kami akan mengirim instruksi untuk mengatur ulang password.">
      <NeuInput icon="mail" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="send" onSubmitEditing={submit} />
      {msg && <ErrorText msg={msg.text} ok={msg.ok} />}
      <Btn title="Kirim link reset" icon="paper-plane" onPress={submit} loading={loading} />
      {msg?.ok && <Btn title="Kembali ke login" variant="neu" onPress={() => nav.goBack()} />}
    </AuthShell>
  );
}

export function VerifyEmailScreen() {
  const { me } = useStore();
  const t = useTheme();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [cool, setCool] = useState(0);
  const [polling, setPolling] = useState(false);

  // Poll emailVerified so the flow completes as soon as the user taps the link.
  useEffect(() => {
    const iv = setInterval(async () => {
      const r = await verifyEmail();
      if (r.ok) setErr('');
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  const submit = async () => {
    setLoading(true);
    const r = await verifyEmail();
    setLoading(false);
    if (!r.ok) setErr(r.error ?? 'Gagal verifikasi');
  };
  const resend = () => {
    sendVerification();
    setCool(30);
    const iv = setInterval(() => setCool((c) => (c <= 1 ? (clearInterval(iv), 0) : c - 1)), 1000);
  };
  return (
    <AuthShell title="Verifikasi Email" subtitle={`Kami mengirim link verifikasi ke ${me?.email}. Buka link tersebut, lalu kembali ke sini.`}>
      <Neu radius={R.lg} style={{ padding: 18, gap: 8, alignItems: 'center' }}>
        <Ionicons name="mail-open" size={34} color={t.accent} />
        <T v="sub" style={{ textAlign: 'center' }}>
          Verifikasi berjalan otomatis. Tidak sampai juga? Periksa folder spam, atau kirim ulang link di bawah.
        </T>
        {polling && <T v="caption" color={t.accent}>Memeriksa status verifikasi…</T>}
      </Neu>
      <ErrorText msg={err} />
      <Btn title="Cek status verifikasi" icon="refresh" onPress={submit} loading={loading} />
      <Btn title={cool ? `Kirim ulang (${cool}s)` : 'Kirim ulang email'} variant="neu" onPress={resend} disabled={cool > 0} />
      <Pressable onPress={logout} style={{ alignSelf: 'center', padding: 8 }}>
        <T v="sub" color={t.danger} style={{ fontWeight: '600' }}>
          Keluar
        </T>
      </Pressable>
    </AuthShell>
  );
}
