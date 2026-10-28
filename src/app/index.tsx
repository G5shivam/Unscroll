import { Redirect } from 'expo-router';
import { useUnscroll } from '../state/provider';

export default function Index() {
  const { state } = useUnscroll();
  return <Redirect href={state.onboarded ? '/(tabs)' : '/onboarding'} />;
}
