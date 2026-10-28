import React from 'react';
import { View, Platform, Pressable, Linking } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../components/ui';

function VideoPane({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls contentFit="contain" />;
}

export default function MediaViewer() {
  const nav = useNavigation();
  const { params } = useRoute<any>();
  const insets = useSafeAreaInsets();
  const uri: string | undefined = params?.uri;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {!uri ? (
          <T v="body" color="#fff">
            Media tidak tersedia
          </T>
        ) : params?.type === 'video' ? (
          <VideoPane uri={uri} />
        ) : (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
        )}
      </View>
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Tutup">
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        {uri && (
          <Pressable onPress={() => (Platform.OS === 'web' ? window.open(uri, '_blank') : Linking.openURL(uri).catch(() => {}))} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Buka">
            <Ionicons name="open-outline" size={22} color="#fff" />
          </Pressable>
        )}
      </View>
      {!!params?.caption && (
        <View style={{ position: 'absolute', bottom: insets.bottom + 20, left: 20, right: 20, padding: 14, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <T v="body" color="#fff">
            {params.caption}
          </T>
        </View>
      )}
    </View>
  );
}
