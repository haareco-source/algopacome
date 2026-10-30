import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';
import { useMyBusiness } from '@/providers/my-business';

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, profile, signOut } = useAuth();
  const { business } = useMyBusiness();
  const name = profile?.display_name ?? '';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <Screen
      header={
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle" style={{ color: theme.primary }}>
              {initials}
            </ThemedText>
          </View>
          <ThemedText type="heading" style={{ color: theme.onPrimary }}>
            {name}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.onPrimary }}>
            {profile?.phone ?? session?.user.email}
          </ThemedText>
        </View>
      }>
      <View style={[styles.menu, { borderColor: theme.border }]}>
        <MenuRow sf="bag" md="receipt_long" title="Mis pedidos" onPress={() => router.navigate('/pedidos')} />
        <MenuRow
          sf="storefront"
          md="storefront"
          title={business ? 'Mi negocio' : 'Quiero vender'}
          badge={business ? undefined : 'Gratis'}
          onPress={() => router.push(business ? '/vender' : '/vender/alta')}
        />
        <MenuRow sf="checkmark.shield" md="verified_user" title="Reglas de convivencia" onPress={() => router.push('/reglas')} />
        <MenuRow sf="rectangle.portrait.and.arrow.right" md="logout" title="Cerrar sesión" danger onPress={signOut} last />
      </View>
    </Screen>
  );
}

type MenuRowProps = {
  sf: ComponentProps<typeof Icon>['sf'];
  md: ComponentProps<typeof Icon>['md'];
  title: string;
  badge?: string;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
};

function MenuRow({ sf, md, title, badge, danger, last, onPress }: MenuRowProps) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}>
      <Icon sf={sf} md={md} size={22} color={danger ? theme.danger : theme.primary} />
      <ThemedText type="defaultBold" style={[styles.flex, { color }]}>
        {title}
      </ThemedText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {badge}
          </ThemedText>
        </View>
      ) : onPress && !danger ? (
        <Icon sf="chevron.right" md="chevron_right" size={20} color={theme.textSecondary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  menu: {
    borderRadius: Radius.card,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    minHeight: 60,
  },
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  flex: {
    flex: 1,
  },
});
