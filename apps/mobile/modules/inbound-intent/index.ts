import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

export interface InboundIntentData {
  channel: 'share';
  uri: string;
  providerAuthority?: string | undefined;
  displayName?: string | undefined;
  mimeType?: string | undefined;
  referrer?: string | undefined;
  size?: number | undefined;
}

interface InboundIntentModuleType {
  getInitialIntent(): Promise<InboundIntentData | null>;
  clearIntent(): Promise<void>;
  addListener(eventName: 'onNewIntent', listener: (data: InboundIntentData) => void): EventSubscription;
}

const InboundIntent = requireOptionalNativeModule<InboundIntentModuleType>('InboundIntent');

export async function getInitialIntent(): Promise<InboundIntentData | null> {
  if (!InboundIntent?.getInitialIntent) return null;
  return await InboundIntent.getInitialIntent();
}

export async function clearIntent(): Promise<void> {
  if (!InboundIntent?.clearIntent) return;
  await InboundIntent.clearIntent();
}

export function addInboundIntentListener(
  listener: (data: InboundIntentData) => void
): EventSubscription | null {
  if (!InboundIntent?.addListener) return null;
  return InboundIntent.addListener('onNewIntent', listener);
}
