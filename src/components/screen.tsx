import { StatusBar } from 'expo-status-bar';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  // Portada naranja con el borde inferior redondeado, arriba de todo.
  header?: ReactNode;
  headerMinHeight?: number;
  // Barra fija abajo (por ejemplo, ver carrito), fuera del scroll.
  footer?: ReactNode;
}>;

// Contenedor de pantalla: área segura, scroll, teclado y portada opcional.
export function Screen({ header, headerMinHeight, footer, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.flex}>
      <StatusBar style={header ? 'light' : 'auto'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: footer ? Spacing.four : insets.bottom + Spacing.four }]}
          keyboardShouldPersistTaps="handled">
          {header ? (
            <View
              style={[
                styles.header,
                { backgroundColor: theme.primary, paddingTop: insets.top + Spacing.four, minHeight: headerMinHeight },
              ]}>
              <View style={styles.headerContent}>{header}</View>
            </View>
          ) : (
            <View style={{ height: insets.top }} />
          )}
          <View style={styles.content}>{children}</View>
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + Spacing.three, borderColor: theme.border, backgroundColor: theme.background },
            ]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    justifyContent: 'flex-end',
  },
  headerContent: {
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.four,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
