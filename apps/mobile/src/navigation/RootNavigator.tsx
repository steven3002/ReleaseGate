import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './routes';
import {
  WorkspaceHomeScreen,
  WorkspaceSetupScreen,
} from '../features/workspace';
import {
  ReleaseImportScreen,
  ReleaseDetailScreen,
} from '../features/release-import';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="WorkspaceHome"
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#f9fafb' },
      }}
    >
      <Stack.Screen
        name="WorkspaceHome"
        component={WorkspaceHomeScreen}
        options={{ title: 'ReleaseGate' }}
      />
      <Stack.Screen
        name="WorkspaceSetup"
        component={WorkspaceSetupScreen}
        options={{ title: 'Setup Workspace' }}
      />
      <Stack.Screen
        name="ReleaseImport"
        component={ReleaseImportScreen}
        options={{ title: 'Import Release' }}
      />
      <Stack.Screen
        name="ReleaseDetail"
        component={ReleaseDetailScreen}
        options={{ title: 'Release Overview' }}
      />
    </Stack.Navigator>
  );
}
