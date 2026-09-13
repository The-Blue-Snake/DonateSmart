import { Colors, Spacing } from '@/constants/theme';
import type { TaxonomyCategory } from '@/constants/types';
import taxonomyData from '@/data/taxonomy.json';
import { useAppTabNavigation } from '@/components/app-tab-navigation';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManualEntry() {
  const params = useLocalSearchParams<{ prefill?: string }>();
  const { navigateToTab } = useAppTabNavigation();
  const [query, setQuery] = useState(params.prefill ?? '');

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return (taxonomyData as TaxonomyCategory[])
      .filter((category) =>
        category.fullPath.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 50);
  }, [query]);

  const selectCategory = (category: TaxonomyCategory) => {
    router.dismiss();
    navigateToTab('centers', {
      category: category.fullPath,
      topLevel: category.topLevel,
      name: category.name,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.searchSection}>
            <View style={styles.inputShell}>
              <TextInput
                style={styles.input}
                placeholder="Search items..."
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>
          </View>

          {query.trim() ? (
            <View style={styles.resultsSection}>
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.resultRow,
                      index !== results.length - 1 &&
                        styles.resultDivider,
                      pressed && styles.resultPressed,
                    ]}
                    onPress={() => selectCategory(item)}
                  >
                    <View style={styles.resultText}>
                      <Text style={styles.resultName}>
                        {item.name}
                      </Text>

                      <Text
                        style={styles.resultPath}
                        numberOfLines={1}
                      >
                        {item.fullPath}
                      </Text>
                    </View>

                    <View style={styles.chevron}>
                      <Text style={styles.chevronText}>›</Text>
                    </View>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>
                      No matches. Try a different word.
                    </Text>
                  </View>
                }
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                Search for something you're donating
              </Text>
            </View>
          )}
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

content: { flex: 1, paddingHorizontal: Spacing.screen, paddingTop: 20, justifyContent: 'flex-start', },

  card: {
    width: '100%',
    maxHeight: '78%',
    minHeight: 294,
    overflow: 'hidden',
    borderWidth: 1,
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

  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },

  inputShell: {
    minHeight: 52,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },

  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 15,
  },

  resultsSection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  resultRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingVertical: 12,
    gap: 12,
  },

  resultDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  resultPressed: {
    backgroundColor: Colors.background,
  },

  resultText: {
    flex: 1,
    minWidth: 0,
  },

  resultName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  resultPath: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },

  chevron: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chevronText: {
    color: Colors.textMuted,
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 27,
  },

  placeholder: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  placeholderText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  empty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
