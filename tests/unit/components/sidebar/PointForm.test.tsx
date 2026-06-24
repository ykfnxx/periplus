import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PointForm from '@/components/sidebar/PointForm';

describe('PointForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  it('renders add form when no point provided', () => {
    render(<PointForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
    expect(screen.getByText('添加地点')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
  });

  it('renders edit form when point provided', () => {
    const point = {
      id: 'p1',
      name: 'Test Point',
      lat: 34.5,
      lng: 108.9,
      order: 0,
      stayDays: 2,
      notes: 'Test notes',
    };

    render(<PointForm point={point} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
    expect(screen.getByText('编辑地点')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Point')).toBeInTheDocument();
    expect(screen.getByDisplayValue('34.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('108.9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test notes')).toBeInTheDocument();
  });

  it('submits form with correct data', () => {
    render(<PointForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByPlaceholderText('地点名称'), { target: { value: 'New Point' } });
    fireEvent.change(screen.getByPlaceholderText('纬度'), { target: { value: '35.0' } });
    fireEvent.change(screen.getByPlaceholderText('经度'), { target: { value: '110.0' } });
    fireEvent.change(screen.getByPlaceholderText('停留天数（可选）'), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('备注（可选）'), { target: { value: 'Some notes' } });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      name: 'New Point',
      lat: 35.0,
      lng: 110.0,
      order: 0,
      stayDays: 3,
      notes: 'Some notes',
    });
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<PointForm onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('preserves order when editing', () => {
    const point = {
      id: 'p1',
      name: 'Test Point',
      lat: 34.5,
      lng: 108.9,
      order: 5,
    };

    render(<PointForm point={point} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

    fireEvent.change(screen.getByPlaceholderText('地点名称'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ order: 5 }));
  });
});
