import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PhotoShareList from '@/components/sidebar/PhotoShareList';

const mockUseMapStore = vi.fn();
vi.mock('@/stores/mapStore', () => ({
  useMapStore: (selector: unknown) => mockUseMapStore(selector),
}));

describe('PhotoShareList', () => {
  it('renders empty state when no photos', () => {
    mockUseMapStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { photoShares: [], setSelectedPhotoShare: vi.fn(), updatePhotoShareCaption: vi.fn() };
      return selector(state);
    });

    render(<PhotoShareList />);
    expect(screen.getByText('暂无照片分享')).toBeInTheDocument();
  });

  it('renders photo items with caption', () => {
    const mockPhotos = [
      {
        id: 'photo-1',
        lat: 39.9,
        lng: 116.4,
        imageDataUrl: 'data:image/jpeg;base64,abc123',
        caption: '测试文案',
        createdAt: Date.now(),
      },
    ];

    mockUseMapStore.mockImplementation((selector: (s: unknown) => unknown) => {
      const state = {
        photoShares: mockPhotos,
        setSelectedPhotoShare: vi.fn(),
        updatePhotoShareCaption: vi.fn(),
      };
      return selector(state);
    });

    render(<PhotoShareList />);
    expect(screen.getByDisplayValue('测试文案')).toBeInTheDocument();
    expect(screen.getByText('39.9000, 116.4000')).toBeInTheDocument();
  });
});
