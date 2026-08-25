import { Colors, Spacing } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

export default function Home() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>What are you donating?</Text>
        </View>

        <View style={styles.list}>
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
                <Ionicons name={icon} size={20} color={Colors.primary} />
              </View>

              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowDescription}>{description}</Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
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
  header: {
    paddingTop: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.4,
  },
  list: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowPressed: {
    backgroundColor: Colors.background,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 3,
  },
  rowDescription: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});