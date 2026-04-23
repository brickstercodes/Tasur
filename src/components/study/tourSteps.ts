import type { DriveStep } from 'driver.js';

export const mindmapTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to Tasur',
      description:
        'Your notes have been transformed into an interactive study experience. This quick tour shows you how to use it.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '#mindmap-canvas',
    popover: {
      title: 'Your concept map',
      description:
        'Every node is a concept extracted from your notes. The connections show how ideas relate to each other.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#mindmap-toolbar',
    popover: {
      title: 'Navigation toolbar',
      description:
        'Zoom in/out, fit the map to screen, search for a concept, or hit Continue to resume your last chat.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '.study-tabs-row',
    popover: {
      title: 'Mindmap & Flashcards',
      description:
        'Switch to Flashcards for spaced-repetition review. Tasur tracks your confidence per concept and surfaces what needs work.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '.react-flow__node',
    popover: {
      title: 'Click any node to study it',
      description:
        'Tap a concept to open a 1-on-1 AI chat. The tutor knows your notes and will explain, quiz, or clarify — try it now!',
      side: 'right',
      align: 'center',
    },
  },
];

export const chatTourSteps: DriveStep[] = [
  {
    popover: {
      title: 'Your AI study chat',
      description:
        'This is a 1-on-1 session focused on the concept you just opened. Tasur will guide you through it based on your learning mode.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '.chat-composer',
    popover: {
      title: 'Ask anything',
      description:
        'Type a question, ask for an example, or just hit Enter — Tasur will start explaining without you needing to prompt it.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '.focus-zone-shell',
    popover: {
      title: 'Source document',
      description:
        'Your original notes are always here for reference. On mobile, switch between Chat and Document using the tabs above.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '.chat-concept-breadcrumb',
    popover: {
      title: 'Navigate freely',
      description:
        'Go back to the mindmap any time to pick a different concept. Your chat history is saved per concept.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    popover: {
      title: "You're all set",
      description:
        'Head back to the dashboard and upload your own notes to get started. Tasur turns any document into a full study experience.',
      side: 'over',
      align: 'center',
    },
  },
];
