
import { Border, Colors, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OPTIONS = [
  {
    title: 'Scan Barcode',
    description: 'For packaged food, electronics, and retail items',
    icon: 'barcode-outline' as const,
    route: '/barcode-scan' as const,
  },
  {
    title: 'Take a Photo',
    description: 'For clothing, furniture, and anything without a barcode',
    icon: 'camera-outline' as const,
    route: '/photo-scan' as const,
  },
  {
    title: 'Enter Manually',
    description: "Search for your item's category yourself",
    icon: 'create-outline' as const,
    route: '/manual-entry' as const,
  },
];

const BRAND_OUTLINE_OFFSETS = [
  [-0.7, 0],
  [0.7, 0],
  [0, -0.7],
  [0, 0.7],
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
] as const;

export default function Home() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.brandTitleContainer}>
          {BRAND_OUTLINE_OFFSETS.map(([x, y], index) => (
            <Text
              key={index}
              accessible={false}
              style={[
                styles.brandTitle,
                styles.brandTitleOutline,
                { transform: [{ rotate: '-2deg' }, { translateX: x }, { translateY: y }] },
              ]}
            >
              DonateSmart
            </Text>
          ))}
          <Text
            accessibilityRole="header"
            style={[styles.brandTitle, styles.brandTitleFace]}
          >
            DonateSmart
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.card}>
            {OPTIONS.map(({ title, description, icon, route }, index) => (
              <Pressable
                key={title}
                style={({ pressed }) => [
                  styles.row,
                  index !== OPTIONS.length - 1 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push(route)}
              >
                <View style={styles.iconChip}>
                  <Ionicons
                    name={icon}
                    size={21}
                    color={Colors.white}
                  />
                </View>

                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{title}</Text>

                  <Text style={styles.rowDescription}>
                    {description}
                  </Text>
                </View>

                <View style={styles.chevron}>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.screen,
  },

  brandTitle: {
    fontFamily: Platform.select({
      ios: 'MarkerFelt-Wide',
      android: 'casual',
      default: 'cursive',
    }),
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    includeFontPadding: false,
  },

  brandTitleContainer: {
    position: 'relative',
    marginTop: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandTitleOutline: {
    position: 'absolute',
    alignSelf: 'stretch',
    color: Colors.border,
  },

  brandTitleFace: {
    color: Colors.primary,
    transform: [{ rotate: '-2deg' }],
  },

  actions: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },

  card: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.card,

    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 6,
  },

  row: {
    minHeight: 132,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 15,
  },

  rowDivider: {
    borderBottomWidth: Border.width,
    borderBottomColor: Colors.border,
  },

  rowPressed: {
    backgroundColor: Colors.background,
  },

  iconChip: {
    width: 46,
    height: 46,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
  },

  rowText: {
    flex: 1,
    minWidth: 0,
  },

  rowTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 5,
  },

  rowDescription: {
    color: Colors.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },

  chevron: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
