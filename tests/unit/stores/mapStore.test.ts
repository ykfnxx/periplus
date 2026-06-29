import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '@/stores/mapStore';

describe('mapStore UI state', () => {
  beforeEach(() => {
    useMapStore.setState({
      activeWorkbenchTool: 'plan',
      composerInput: '',
      editingPointId: null,
      addPointMode: 'closed',
      pointSelectionDraft: null,
      locationSelectionMode: 'none',
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
    });
  });

  it('switches workbench tools', () => {
    useMapStore.getState().setActiveWorkbenchTool('places');
    expect(useMapStore.getState().activeWorkbenchTool).toBe('places');
  });

  it('preserves the composer input outside tool switching', () => {
    useMapStore.getState().setComposerInput('帮我把敦煌多留半天');
    useMapStore.getState().setActiveWorkbenchTool('photos');
    expect(useMapStore.getState().composerInput).toBe('帮我把敦煌多留半天');
  });

  it('opens point editing and switches to plan', () => {
    useMapStore.getState().setEditingPointId('point-1');
    expect(useMapStore.getState().editingPointId).toBe('point-1');
    expect(useMapStore.getState().activeWorkbenchTool).toBe('plan');
  });

  it('starts point location selection from the places tool', () => {
    useMapStore.getState().startPointLocationSelection();
    expect(useMapStore.getState()).toMatchObject({
      locationSelectionMode: 'point',
      isSelectingLocation: true,
      addPointMode: 'map-select',
      activeWorkbenchTool: 'places',
    });
  });

  it('starts photo location selection from the photos tool', () => {
    useMapStore.getState().startPhotoLocationSelection('data-url');
    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: 'data-url',
      locationSelectionMode: 'photo',
      isSelectingLocation: true,
      activeWorkbenchTool: 'photos',
      addPointMode: 'closed',
      pointSelectionDraft: null,
    });
  });

  it('clears active location selection state', () => {
    useMapStore.setState({
      pendingPhotoDataUrl: 'data-url',
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
    });

    useMapStore.getState().clearLocationSelection();

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: null,
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
      isSelectingLocation: false,
      locationSelectionMode: 'none',
      addPointMode: 'closed',
    });
  });
});
