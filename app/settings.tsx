import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useAppStore } from '../store/app';
import { database } from '../db';
import { runSync } from '../lib/sync';
import { decodeSyncKey, saveCredentials, clearCredentials, api } from '../lib/api';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Helper to base64 encode strings in a cross-platform manner
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
  const { syncConfig, syncStatus, setSyncConfig } = useAppStore();
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
      // Save credentials in SecureStore
      await saveCredentials(creds.workerUrl, creds.syncSecret);

      // Update store sync config
      setSyncConfig(creds);

      Toast.show({
        type: 'success',
        text1: 'Configuration Saved',
        text2: 'Settings saved and initial sync scheduled.',
      });

      // Run background sync
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

  return (
    <ScrollView className="flex-1 bg-slate-50 dark:bg-slate-900 px-6 py-8">
      {/* Status Indicators */}
      <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 mb-6 border border-slate-100 dark:border-slate-800/50 shadow-sm">
        <Text className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-xs font-semibold">
          Connection Status
        </Text>
        <View className="flex-row items-center mt-3">
          <View
            className={`h-4 w-4 rounded-full ${
              syncStatus === 'idle'
                ? 'bg-emerald-500'
                : syncStatus === 'syncing'
                ? 'bg-amber-500'
                : syncStatus === 'error'
                ? 'bg-rose-500'
                : 'bg-slate-400'
            }`}
          />
          <Text className="text-lg font-bold text-slate-800 dark:text-slate-100 ml-3 capitalize">
            {syncStatus === 'idle'
              ? 'Connected'
              : syncStatus === 'syncing'
              ? 'Syncing...'
              : syncStatus === 'error'
              ? 'Connection Error'
              : 'Not Configured'}
          </Text>
        </View>
        {syncConfig && (
          <Text className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-mono">
            URL: {syncConfig.workerUrl}
          </Text>
        )}
      </View>

      {/* Sync Key Entry */}
      <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 mb-8 border border-slate-100 dark:border-slate-800/50 shadow-sm">
        <Text className="text-slate-800 dark:text-slate-100 font-bold text-base mb-2">
          Sync Connection Key
        </Text>
        <Text className="text-slate-400 dark:text-slate-500 text-xs mb-4">
          Paste the Base64 connection credentials code generated from your Cloudflare Worker
          deployment.
        </Text>

        <TextInput
          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm font-mono min-h-[80px]"
          multiline
          placeholder="Paste connection key here..."
          placeholderTextColor="#94A3B8"
          value={syncKey}
          onChangeText={(val) => {
            setSyncKey(val);
            setErrorText(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {errorText ? (
          <Text className="text-rose-600 dark:text-rose-400 text-xs font-semibold mt-2.5">
            {errorText}
          </Text>
        ) : null}

        {/* Action Buttons */}
        <View className="flex-row mt-6">
          <TouchableOpacity
            className="flex-1 bg-slate-100 dark:bg-slate-900 py-4 rounded-xl flex-row justify-center items-center active:scale-[0.98] mr-2"
            onPress={handleTestConnection}
            disabled={testing || saving}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Text className="text-slate-700 dark:text-slate-300 font-bold text-sm">
                Test Connection
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-1 bg-indigo-600 dark:bg-indigo-500 py-4 rounded-xl flex-row justify-center items-center active:scale-[0.98] ml-2"
            onPress={handleSave}
            disabled={testing || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-white font-bold text-sm">Save Config</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Disconnect Option */}
      {syncConfig && (
        <TouchableOpacity
          className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 py-4 rounded-xl items-center justify-center mb-8 active:scale-[0.98]"
          onPress={handleDisconnect}
          disabled={testing || saving}
        >
          <Text className="text-rose-600 dark:text-rose-400 font-bold text-sm">
            Disconnect Ledger
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
