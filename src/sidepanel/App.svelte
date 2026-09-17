<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$components/ui/tabs';
  import ChatTab from './tabs/ChatTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';
  import NewsTab from './tabs/NewsTab.svelte';
  import WorkflowsTab from './tabs/WorkflowsTab.svelte';
  import ProfileTab from './tabs/ProfileTab.svelte';
  import { createReconnectingPort } from './reconnecting-port';
  import { loadSettings } from './stores/settings';
  import { hydrateNewsCache } from './stores/news';
  import { hydratePlaybookSelection } from './stores/playbook';
  import { hydrateProfile } from './stores/profile';

  let currentTab = $state('chat');

  // Chat reconnects on demand: the worker is suspended long before most users
  // type their first message, and a stale port makes send/stop throw.
  const chatPort = createReconnectingPort('chat');
  setContext('chatPort', chatPort);

  onMount(() => {
    void loadSettings();
    // Storage read only, never the network — News fetches on the button, not on mount.
    // Lives here rather than in NewsTab, whose onMount runs on every tab switch back.
    void hydrateNewsCache();
    // Same reason as above: WorkflowsTab's onMount runs on every switch back to the tab.
    void hydratePlaybookSelection();
    // And again: the profile editor must not re-read storage over a half-written draft
    // every time the user switches tabs and back.
    void hydrateProfile();
    return () => {
      chatPort.disconnect();
    };
  });
</script>

<Tabs bind:value={currentTab} class="h-full flex flex-col">
  <TabsList class="w-full">
    <TabsTrigger value="chat" class="px-2">Chat</TabsTrigger>
    <TabsTrigger value="news" class="px-2">News</TabsTrigger>
    <TabsTrigger value="workflows" class="px-2">Workflows</TabsTrigger>
    <TabsTrigger value="profile" class="px-2">Profile</TabsTrigger>
    <TabsTrigger value="settings" class="px-2">Settings</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" class="flex-1 overflow-hidden"><ChatTab /></TabsContent>
  <TabsContent value="news" class="flex-1 overflow-hidden"><NewsTab /></TabsContent>
  <TabsContent value="workflows" class="flex-1 overflow-hidden"><WorkflowsTab /></TabsContent>
  <TabsContent value="profile" class="flex-1 overflow-hidden"><ProfileTab /></TabsContent>
  <TabsContent value="settings"><SettingsTab /></TabsContent>
</Tabs>
