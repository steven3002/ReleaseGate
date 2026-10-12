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
import { ProposalReviewScreen } from '../features/proposal-review';
import { CreateGuardedProposalScreen } from '../features/guarded-proposal';
import { ReceiptScreen } from '../features/receipts';
import { PendingOperationsScreen } from '../features/recovery';

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
      <Stack.Screen
        name="ProposalReview"
        component={ProposalReviewScreen}
        options={{ title: 'Review Proposal' }}
      />
      <Stack.Screen
        name="CreateGuardedProposal"
        component={CreateGuardedProposalScreen}
        options={{ title: 'Guarded Proposal' }}
      />
      <Stack.Screen
        name="DeploymentReceipt"
        component={ReceiptScreen}
        options={{ title: 'Deployment Receipt' }}
      />
      <Stack.Screen
        name="PendingOperations"
        component={PendingOperationsScreen}
        options={{ title: 'Operations Journal' }}
      />
    </Stack.Navigator>
  );
}
