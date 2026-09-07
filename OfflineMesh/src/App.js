/**
 * App.js
 *
 * The root of the OfflineMesh citizen app.
 *
 * CITIZEN UI — intentionally simple:
 *   📡 Receiver  — see incoming disaster alerts
 *   🚨 Send Alert — send a disaster alert to nearby phones
 *
 * That's it. No analytics. No network diagrams. No government login.
 * The complexity lives in the separate Emergency Command Center (web dashboard).
 *
 * Why only two tabs?
 * During a disaster, citizens need to do one thing fast. Every extra
 * tab adds cognitive load. Two large targets = better usability under stress.
 *
 * The Analytics and Network screens (AnalyticsDashboard.js,
 * NetworkVisualization.js) still exist in src/screens/ and all their
 * logic is preserved — they've just been moved out of the citizen navigation.
 * That functionality lives in the laptop Emergency Command Center instead.
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  StatusBar,
} from 'react-native';

import { MessageProvider } from './context/MessageContext';
import SenderScreen   from './screens/SenderScreen';
import ReceiverScreen from './screens/ReceiverScreen';

// Two tabs — the full extent of the citizen interface
const TABS = [
  { key: 'receiver', icon: '📡', label: 'Receive' },
  { key: 'sender',   icon: '🚨', label: 'Send Alert' },
];

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

export default function App() {
  // Receiver is the default tab — citizens should see incoming alerts first
  const [activeTab, setActiveTab] = useState('receiver');

  return (
    <MessageProvider>
      <StatusBar backgroundColor="#0d0d1a" barStyle="light-content" />
      <SafeAreaView style={styles.root}>
        <View style={styles.content}>
          {activeTab === 'sender' ? <SenderScreen /> : <ReceiverScreen />}
        </View>
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </SafeAreaView>
    </MessageProvider>
  );
}

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
    height: 62,
    paddingBottom: 6,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.4,
    paddingTop: 6,
    gap: 3,
  },
  tabActive: {
    opacity: 1,
    borderTopWidth: 3,
    borderTopColor: '#e74c3c',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 11,
    color: '#aaaacc',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#ffffff',
  },
});
