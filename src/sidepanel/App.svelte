<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$components/ui/tabs';
  import ChatTab from './tabs/ChatTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';
  import AgentTab from './tabs/AgentTab.svelte';

  let currentTab = $state('chat');

  onMount(() => {
    const chatPort = chrome.runtime.connect({ name: 'chat' });
    const agentPort = chrome.runtime.connect({ name: 'agent' });
    setContext('chatPort', chatPort);
    setContext('agentPort', agentPort);
    return () => {
      chatPort.disconnect();
      agentPort.disconnect();
    };
  });
</script>

<Tabs bind:value={currentTab} class="h-full flex flex-col">
  <TabsList>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
    <TabsTrigger value="agent">Agent</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" class="flex-1 overflow-hidden"><ChatTab /></TabsContent>
  <TabsContent value="settings"><SettingsTab /></TabsContent>
  <TabsContent value="agent"><AgentTab /></TabsContent>
</Tabs>
