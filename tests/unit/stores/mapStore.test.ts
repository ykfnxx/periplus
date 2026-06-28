import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '@/stores/mapStore';

describe('mapStore UI state', () => {
  beforeEach(() => {
    useMapStore.setState({
      activeWorkbenchTab: 'explore',
      editingPointId: null,
      addPointMode: 'closed',
      pointSelectionDraft: null,
      locationSelectionMode: 'none',
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
    });
  });

  it('switches workbench tabs', () => {
    useMapStore.getState().setActiveWorkbenchTab('plan');
    expect(useMapStore.getState().activeWorkbenchTab).toBe('plan');
  });

  it('opens point editing and switches to plan tab', () => {
    useMapStore.getState().setEditingPointId('point-1');
    expect(useMapStore.getState().editingPointId).toBe('point-1');
    expect(useMapStore.getState().activeWorkbenchTab).toBe('plan');
  });

  it('starts point location selection', () => {
    useMapStore.getState().startPointLocationSelection();
    expect(useMapStore.getState().locationSelectionMode).toBe('point');
    expect(useMapStore.getState().isSelectingLocation).toBe(true);
  });

  it('stores a clicked point selection draft', () => {
    useMapStore.getState().setPointSelectionDraft({ lat: 39.9, lng: 116.4 });
    expect(useMapStore.getState().pointSelectionDraft).toEqual({
      lat: 39.9,
      lng: 116.4,
    });
  });

  it('switches to plan tab when opening add point modes', () => {
    useMapStore.getState().setAddPointMode('search');
    expect(useMapStore.getState().addPointMode).toBe('search');
    expect(useMapStore.getState().activeWorkbenchTab).toBe('plan');
  });

  it('preserves active tab when closing add point mode', () => {
    useMapStore.getState().setActiveWorkbenchTab('saved');
    useMapStore.getState().setAddPointMode('closed');
    expect(useMapStore.getState().addPointMode).toBe('closed');
    expect(useMapStore.getState().activeWorkbenchTab).toBe('saved');
  });

  it('starts photo location selection and clears point add state', () => {
    useMapStore.setState({
      addPointMode: 'map-select',
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
    });

    useMapStore.getState().startPhotoLocationSelection('data-url');

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: 'data-url',
      isSelectingLocation: true,
      locationSelectionMode: 'photo',
      activeWorkbenchTab: 'plan',
      addPointMode: 'closed',
      pointSelectionDraft: null,
    });
  });

  it('starts point location selection and clears stale photo and draft state', () => {
    useMapStore.setState({
      pendingPhotoDataUrl: 'old-data-url',
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
    });

    useMapStore.getState().startPointLocationSelection();

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: null,
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
      activeWorkbenchTab: 'plan',
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

  it('legacy photo data setter starts photo location selection', () => {
    useMapStore.setState({
      activeWorkbenchTab: 'saved',
      addPointMode: 'map-select',
      pointSelectionDraft: { lat: 31.23, lng: 121.47 },
    });

    useMapStore.getState().setPendingPhotoDataUrl('data-url');

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: 'data-url',
      locationSelectionMode: 'photo',
      isSelectingLocation: true,
      activeWorkbenchTab: 'plan',
      addPointMode: 'closed',
      pointSelectionDraft: null,
    });
  });

  it('legacy photo data setter clears photo selection state', () => {
    useMapStore.setState({
      pendingPhotoDataUrl: 'data-url',
      isSelectingLocation: true,
      locationSelectionMode: 'photo',
    });

    useMapStore.getState().setPendingPhotoDataUrl(null);

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: null,
      locationSelectionMode: 'none',
      isSelectingLocation: false,
    });
  });

  it('legacy selecting setter clears point selection state', () => {
    useMapStore.setState({
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
    });

    useMapStore.getState().setIsSelectingLocation(false);

    expect(useMapStore.getState()).toMatchObject({
      isSelectingLocation: false,
      locationSelectionMode: 'none',
      addPointMode: 'closed',
    });
  });

  it('legacy selecting setter clears photo selection state', () => {
    useMapStore.setState({
      pendingPhotoDataUrl: 'data-url',
      isSelectingLocation: true,
      locationSelectionMode: 'photo',
    });

    useMapStore.getState().setIsSelectingLocation(false);

    expect(useMapStore.getState()).toMatchObject({
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
      locationSelectionMode: 'none',
    });
  });

  it('legacy selecting setter enters point selection from initial state', () => {
    useMapStore.getState().setIsSelectingLocation(true);

    expect(useMapStore.getState()).toMatchObject({
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
      pendingPhotoDataUrl: null,
      activeWorkbenchTab: 'plan',
    });
  });

  it('legacy selecting setter preserves existing active selection mode', () => {
    useMapStore.setState({
      isSelectingLocation: false,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
    });

    useMapStore.getState().setIsSelectingLocation(true);

    expect(useMapStore.getState()).toMatchObject({
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
    });
  });
});
