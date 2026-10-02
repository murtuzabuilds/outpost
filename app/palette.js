// One palette for the scene. The panels use the same values in style.css; main.js passes `accent` to them.
// The look is restrained on purpose: porcelain and graphite, one accent, and colour only where it
// means something (amber needs a person, red is off limits). `accent` is the brand colour.
const o = typeof window !== 'undefined' && window.__opAccent;
export const P = {
  void: '#05060A', accent: o || '#6F86FF', ice: '#EEF2FA', amber: '#FFB547', red: '#FF4D5E',
  // the station hues are all quiet steels; a place is told apart by its shape and its label
  cyan: '#CFDAF2', violet: '#B9C3E6', orange: '#D8DEEE', teal: '#C3D2EE', magenta: '#DCE3F5', blue: '#AEBBDD',
  deck: ['#1B202E', '#181D2A', '#1E2434'], rim: '#131722', hull: '#0B0D15', seam: '#46526F',
  ceramic: '#E4E9F4', dark: '#232836', navy: '#10131C', metal: '#8E98B0', lamp: '#DCE6FF',
  vaultA: '#24161B', vaultB: '#1D1217',
};
