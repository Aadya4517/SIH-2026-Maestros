/**
 * App.js
 * Root component with a 4-tab bottom navigator:
 *   🚨 Authority  — SenderScreen      (send alerts)
 *   📡 Receiver   — ReceiverScreen    (display incoming alerts)
 *   📊 Analytics  — AnalyticsDashboard (delivery metrics)
 *   🕸️ Network    — NetworkVisualization (mesh diagram)
 */

import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  StatusBar,
  ScrollView,
} from 'react-native';

import { MessageProvider } from './context/MessageContext';
import SenderScreen          from './screens/SenderScreen';
import ReceiverScreen        from './screens/ReceiverScreen';
import AnalyticsDashboard    from './screens/AnalyticsDashboard';
import NetworkVisualization  from './screens/NetworkVisualization';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'receiver',  icon: '📡', label: 'Receiver'  },
  { key: 'sender',    icon: '🚨', label: 'Authority' },
  { key: 'analytics', icon: '📊', label: 'Analytics' },
  { key: 'network',   icon: '🕸️', label: 'Network'   },
];

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ activeTab, onTabChange }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map(tab => {
        const active = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onTabChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label} tab`}>
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = React.useState('receiver');

  function renderScreen() {
    switch (activeTab) {
      case 'sender':    return <SenderScreen />;
      case 'analytics': return <AnalyticsDashboard />;
      case 'network':   return <NetworkVisualization />;
      default:          return <ReceiverScreen />;
    }
  }

  return (
    <MessageProvider>
      <StatusBar backgroundColor="#0d0d1a" barStyle="light-content" />
      <SafeAreaView style={styles.root}>
        <View style={styles.content}>
          {renderScreen()}
        </View>
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </SafeAreaView>
    </MessageProvider>
  );
}

export default App;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0d0d1a',
    borderTopWidth: 1,
    borderTopColor: '#1e1e3a',
    height: 60,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.45,
    paddingTop: 6,
    gap: 2,
  },
  tabActive: {
    opacity: 1,
    borderTopWidth: 2,
    borderTopColor: '#e74c3c',
  },
  tabIcon: {
    fontSize: 18,
  },
  tabLabel: {
    fontSize: 10,
    color: '#aaaacc',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#ffffff',
  },
});
