import { Colors, Spacing } from '@/constants/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OPTIONS = [
  {
    title: 'Scan Barcode',
    description: 'For packaged food, electronics, and retail items',
    route: '/barcode-scan' as const,
  },
  {
    title: 'Take a Photo',
    description: 'For clothing, furniture, and anything without a barcode',
    route: '/photo-scan' as const,
  },
  {
    title: 'Enter Manually',
    description: "Search for your item's category yourself",
    route: '/manual-entry' as const,
  },
];

export default function Home() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>DonateSmart</Text>
        </View>

        <View style={styles.options}>
          {OPTIONS.map(({ title, description, route }) => (
            <Pressable key={title} style={styles.optionCard} onPress={() => router.push(route)}>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{title}</Text>
                <Text style={styles.optionDescription}>{description}</Text>
              </View>
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
    backgroundColor: Colors.cream,
  },
  content: {
    paddingHorizontal: Spacing.screen,
  },
  hero: {
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
  },
  options: {
    gap: 20,
  },
  optionCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  optionText: {
    paddingVertical: 24,
    paddingHorizontal: 22,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 7,
  },
  optionDescription: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
  },
});