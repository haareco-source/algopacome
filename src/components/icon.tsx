import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

type SymbolName = Exclude<SymbolViewProps['name'], string>;

type IconProps = {
  sf: NonNullable<SymbolName['ios']>;
  md: NonNullable<SymbolName['android']>;
  size?: number;
  color: ColorValue;
};

// SF Symbols en iOS y Material Symbols en Android y web.
export function Icon({ sf, md, size = 24, color }: IconProps) {
  return <SymbolView name={{ ios: sf, android: md, web: md }} size={size} tintColor={color} />;
}
