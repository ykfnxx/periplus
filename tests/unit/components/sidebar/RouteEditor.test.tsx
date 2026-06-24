import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteEditor from '@/components/sidebar/RouteEditor';
import { useMapStore } from '@/stores/mapStore';

vi.mock('@/stores/mapStore', () => ({
  useMapStore: vi.fn(),
}));

describe('RouteEditor', () => {
  const mockSetCurrentRoute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    global.alert = vi.fn();
  });

  it('shows placeholder when no route is selected', () => {
    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: null, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    render(<RouteEditor />);
    expect(screen.getByText('请从首页选择一个路线或创建新路线')).toBeInTheDocument();
  });

  it('renders route name and description', () => {
    const route = {
      id: 'preset-test',
      name: 'Test Route',
      description: 'A test route',
      points: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    render(<RouteEditor />);
    expect(screen.getByText('Test Route')).toBeInTheDocument();
    expect(screen.getByText('A test route')).toBeInTheDocument();
  });

  it('shows add form when add button clicked', () => {
    const route = {
      id: 'preset-test',
      name: 'Test Route',
      points: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    render(<RouteEditor />);
    fireEvent.click(screen.getByText('+ 添加地点'));
    expect(screen.getByText('添加地点')).toBeInTheDocument();
  });

  it('adds a new point', () => {
    const route = {
      id: 'preset-test',
      name: 'Test Route',
      points: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    render(<RouteEditor />);
    fireEvent.click(screen.getByText('+ 添加地点'));

    fireEvent.change(screen.getByPlaceholderText('地点名称'), { target: { value: 'New Point' } });
    fireEvent.change(screen.getByPlaceholderText('纬度'), { target: { value: '35.0' } });
    fireEvent.change(screen.getByPlaceholderText('经度'), { target: { value: '110.0' } });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(mockSetCurrentRoute).toHaveBeenCalled();
    const updatedRoute = mockSetCurrentRoute.mock.calls[0][0];
    expect(updatedRoute.points).toHaveLength(1);
    expect(updatedRoute.points[0].name).toBe('New Point');
    expect(updatedRoute.points[0].order).toBe(0);
  });

  it('deletes a point and reorders', () => {
    const route = {
      id: 'preset-test',
      name: 'Test Route',
      points: [
        { id: 'p1', name: 'Point A', lat: 1, lng: 1, order: 0 },
        { id: 'p2', name: 'Point B', lat: 2, lng: 2, order: 1 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    render(<RouteEditor />);
    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);

    expect(mockSetCurrentRoute).toHaveBeenCalled();
    const updatedRoute = mockSetCurrentRoute.mock.calls[0][0];
    expect(updatedRoute.points).toHaveLength(1);
    expect(updatedRoute.points[0].order).toBe(0);
  });

  it('saves route with POST for preset routes', async () => {
    const route = {
      id: 'preset-test',
      name: 'Test Route',
      points: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    const mockResponse = { id: 'new-id', name: 'Test Route' };
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<RouteEditor />);
    fireEvent.click(screen.getByText('保存路线'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/routes',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('saves route with PUT for existing routes', async () => {
    const route = {
      id: 'existing-id',
      name: 'Test Route',
      points: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { currentRoute: route, setCurrentRoute: mockSetCurrentRoute };
      return selector(state);
    });

    const mockResponse = { id: 'existing-id', name: 'Test Route' };
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<RouteEditor />);
    fireEvent.click(screen.getByText('保存路线'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/routes/existing-id',
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });
});
