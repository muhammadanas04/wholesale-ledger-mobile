import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View, Platform, SafeAreaView } from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { SymbolView } from 'expo-symbols';

interface ImageViewerModalProps {
  visible: boolean;
  imageUrls: { url: string }[];
  onClose: () => void;
  initialIndex?: number;
}

export function ImageViewerModal({ visible, imageUrls, onClose, initialIndex = 0 }: ImageViewerModalProps) {
  return (
    <Modal visible={visible} transparent={true} onRequestClose={onClose}>
      <View style={styles.container}>
        <ImageViewer
          imageUrls={imageUrls}
          index={initialIndex}
          enableSwipeDown={true}
          onCancel={onClose}
          renderIndicator={() => <View />}
        />
        <SafeAreaView style={styles.closeButtonContainer}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor="#FFFFFF" size={24} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeButtonContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 20,
    right: 20,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
