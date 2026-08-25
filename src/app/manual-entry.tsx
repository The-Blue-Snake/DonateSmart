import { Colors, Spacing } from '@/constants/theme';
import type { TaxonomyCategory } from '@/constants/types';
import taxonomyData from '@/data/taxonomy.json';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManualEntry() {
  const params = useLocalSearchParams<{ prefill?: string }>();
  const [query, setQuery] = useState(params.prefill ?? '');

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return (taxonomyData as TaxonomyCategory[])
      .filter((category) => category.fullPath.toLowerCase().includes(normalizedQuery))
      .slice(0, 50);
  }, [query]);

  const selectCategory = (category: TaxonomyCategory) => {
    router.dismissAll();
    router.navigate({
      pathname: '/(tabs)/centers',
      params: {
        category: category.fullPath,
        topLevel: category.topLevel,
        name: category.name,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>What are you donating?</Text>
        <TextInput
          style={styles.input}
          placeholder="Search (e.g. 'shirt', 'blender', 'novel')"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable style={styles.resultRow} onPress={() => selectCategory(item)}>
            <Text style={styles.resultName}>{item.name}</Text>
            <Text style={styles.resultPath} numberOfLines={1}>
              {item.fullPath}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim() ? <Text style={styles.empty}>No matches. Try a different word.</Text> : null
        }
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 16,
  },
  content: {
    paddingHorizontal: Spacing.screen,
    paddingTop: 24,
  },
  listContent: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  resultRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  resultPath: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 40,
    fontSize: 15,
  },
});