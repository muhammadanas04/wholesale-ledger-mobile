import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppStore, ThemeSetting } from '../store/app';
import { database } from '../db';
import { runSync } from '../lib/sync';
import { decodeSyncKey, saveCredentials, clearCredentials, api } from '../lib/api';
import { useColorScheme } from '../components/useColorScheme';
import Colors from '../constants/Colors';
import { GlassView } from '../components/GlassView';
import { ScreenBackground } from '../components/ScreenBackground';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeSyncKey(workerUrl: string, syncSecret: string): string {
  const str = `${workerUrl}|${syncSecret}`;
  if (typeof btoa === 'function') {
    return btoa(str);
  }
  let result = '';
  let i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++);
    const c2 = i < str.length ? str.charCodeAt(i++) : NaN;
    const c3 = i < str.length ? str.charCodeAt(i++) : NaN;
    const byte1 = c1 >> 2;
    const byte2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
    const byte3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6);
    const byte4 = isNaN(c3) ? 64 : c3 & 63;
    result +=
      CHARS.charAt(byte1) +
      CHARS.charAt(byte2) +
      (byte3 === 64 ? '=' : CHARS.charAt(byte3)) +
      (byte4 === 64 ? '=' : CHARS.charAt(byte4));
  }
  return result;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const { syncConfig, syncStatus, setSyncConfig, themeSetting, setThemeSetting } = useAppStore();
  const [syncKey, setSyncKey] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (syncConfig) {
      try {
        const encoded = encodeSyncKey(syncConfig.workerUrl, syncConfig.syncSecret);
        setSyncKey(encoded);
      } catch (e) {
        console.error('Failed to display key in base64:', e);
      }
    }
  }, [syncConfig]);

  const handleTestConnection = async () => {
    if (!syncKey.trim()) {
      setErrorText('Please enter a sync key first.');
      return;
    }

    let creds;
    try {
      creds = decodeSyncKey(syncKey);
    } catch (e: any) {
      setErrorText(e.message || 'Invalid sync key format.');
      return;
    }

    setTesting(true);
    try {
      await api.testConnection(creds.workerUrl, creds.syncSecret);

      Toast.show({
        type: 'success',
        text1: 'Connection Success',
        text2: 'Successfully connected to the Cloudflare Worker!',
      });
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Connection Failed',
        text2: 'Could not connect. Check your sync key.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!syncKey.trim()) {
      setErrorText('Please enter a sync key.');
      return;
    }

    let creds;
    try {
      creds = decodeSyncKey(syncKey);
    } catch (e: any) {
      setErrorText(e.message || 'Invalid sync key format.');
      return;
    }

    setSaving(true);
    try {
      await saveCredentials(creds.workerUrl, creds.syncSecret);
      setSyncConfig(creds);

      Toast.show({
        type: 'success',
        text1: 'Configuration Saved',
        text2: 'Settings saved and initial sync scheduled.',
      });

      runSync(database).catch(() => {});
      router.back();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: e.message || 'Error occurred while saving.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await clearCredentials();
      setSyncConfig(null);
      setSyncKey('');
      Toast.show({
        type: 'success',
        text1: 'Disconnected',
        text2: 'Sync configuration has been cleared.',
      });
      router.back();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to clear credentials.',
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = () => {
    switch (syncStatus) {
      case 'idle':
        return colors.success;
      case 'syncing':
        return colors.warning;
      case 'error':
        return colors.danger;
      default:
        return colors.tabIconDefault;
    }
  };

  const getStatusLabel = () => {
    switch (syncStatus) {
      case 'idle':
        return 'Connected';
      case 'syncing':
        return 'Syncing...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Not Configured';
    }
  };

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: 16 }]} style={styles.scrollView}>
        
        {/* Appearance Configuration */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardLabel, { color: colors.tabIconDefault }]}>
            Appearance
          </Text>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>
            Theme Mode
          </Text>

          <View style={[styles.toggleContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const isActive = themeSetting === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setThemeSetting(mode)}
                  style={[
                    styles.toggleBtn,
                    isActive && {
                      backgroundColor: colors.tint,
                      shadowColor: colors.tint,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 2,
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { 
                        color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                        fontWeight: isActive ? '700' : '600'
                      }
                    ]}
                  >
                    {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassView>

        {/* Status Indicators */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardLabel, { color: colors.tabIconDefault }]}>
            Connection Status
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor() }
              ]}
            />
            <Text style={[styles.statusText, { color: colors.text }]}>
              {getStatusLabel()}
            </Text>
          </View>
          {syncConfig && (
            <Text style={[styles.urlText, { color: colors.tabIconDefault }]} numberOfLines={1}>
              URL: {syncConfig.workerUrl}
            </Text>
          )}
        </GlassView>

        {/* Sync Key Entry */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Sync Connection Key
          </Text>
          <Text style={[styles.cardDescription, { color: colors.tabIconDefault }]}>
            Paste the Base64 connection credentials code generated from your Cloudflare Worker deployment.
          </Text>

          <TextInput
            style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            multiline
            placeholder="Paste connection key here..."
            placeholderTextColor={colors.tabIconDefault}
            value={syncKey}
            onChangeText={(val) => {
              setSyncKey(val);
              setErrorText(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {errorText && (
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {errorText}
            </Text>
          )}

          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={handleTestConnection}
              disabled={testing || saving}
            >
              {testing ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Test Connection
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.tint }]}
              onPress={handleSave}
              disabled={testing || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Config</Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassView>

        {/* Disconnect Option */}
        {syncConfig && (
          <TouchableOpacity
            style={[styles.disconnectBtn, { borderColor: colors.danger }]}
            onPress={handleDisconnect}
            disabled={testing || saving}
          >
            <Text style={[styles.disconnectText, { color: colors.danger }]}>
              Disconnect Ledger
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardDescription: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  toggleText: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    height: 12,
    width: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },
  urlText: {
    fontSize: 11,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  textInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  disconnectBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderStyle: 'dashed',
  },
  disconnectText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
