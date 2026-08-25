import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

type ResultParams = {
  category?: string;
  topLevel?: string;
  name?: string;
};

export default function ResultRedirect() {
  const { category, topLevel, name } = useLocalSearchParams<ResultParams>();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)/centers',
      params: {
        category: category ?? undefined,
        topLevel: topLevel ?? undefined,
        name: name ?? undefined,
      },
    });
  }, [category, topLevel, name]);

  return null;
}
