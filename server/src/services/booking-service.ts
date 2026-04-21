import { v4 as uuid } from 'uuid';
import { DateTime } from 'luxon';
import AsyncLock from 'async-lock';
import type { Booking, BookingStatus, PaginatedResult, AuthContext } from '../types/index.js';
import { VALID_TRANSITIONS } from '../types/index.js';
import { store } from '../store/memory-store.js';
import { eventBus } from './event-emitter.js';
import { slotsOverlap } from './overlap.js';

const bookingLock = new AsyncLock();

interface ListBookingsParams {
  tenantId: string;
  page: number;
  limit: number;
  date?: string;
  status?: BookingStatus;
}

interface CreateBookingParams {
  tenantId: string;
  petId: string;
  sitterId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  createdBy: string;
}

export class BookingService {
  /**
   * List bookings for a tenant with optional date and status filters.
   * Supports pagination.
   */
  public listBookings(params: ListBookingsParams): PaginatedResult<Booking> {
    const { tenantId, page, limit, date, status } = params;

    let bookings = store.getBookingsByTenant(tenantId);

    // Filter by date if provided (interpreted in the tenant's local timezone)
    if (date) {
      const tenant = store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`Unknown tenant: ${tenantId}`);
      }
      const startOfDay = DateTime.fromISO(date, { zone: tenant.timezone }).startOf('day');
      const startUtcMs = startOfDay.toMillis();
      const endUtcMs = startOfDay.plus({ days: 1 }).toMillis();
      bookings = bookings.filter(b => {
        const t = new Date(b.scheduledDate).getTime();
        return t >= startUtcMs && t < endUtcMs;
      });
    }

    // Filter by status if provided
    if (status) {
      bookings = bookings.filter(b => b.status === status);
    }

    // Sort by scheduled date descending (newest first)
    bookings.sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

    const total = bookings.length;
    const totalPages = Math.ceil(total / limit);

    const offset = (page - 1) * limit;
    const paginatedBookings = bookings.slice(offset, offset + limit);

    return {
      data: paginatedBookings,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Create a new booking.
   * Checks for overlapping bookings with the same sitter.
   */
  public async createBooking(params: CreateBookingParams): Promise<Booking> {
    const { tenantId, petId, sitterId, scheduledDate, startTime, endTime, notes, createdBy } = params;

    const pet = store.getPet(petId);
    const sitter = store.getSitter(sitterId);
    if (!pet || pet.tenantId !== tenantId || !sitter || sitter.tenantId !== tenantId) {
      throw new Error('Invalid pet or sitter for this tenant');
    }

    // Serialize overlap-check + write per sitter so concurrent creates can't both pass the TOCTOU gap.
    return bookingLock.acquire(sitterId, async () => {
      const existingBookings = store.getBookingsByTenant(tenantId).filter(
        b => b.sitterId === sitterId && b.status !== 'cancelled',
      );

      const requested = { scheduledDate, startTime, endTime };
      const hasOverlap = existingBookings.some(b => slotsOverlap(requested, b));

      if (hasOverlap) {
        throw new Error('Sitter has an overlapping booking for this time slot');
      }

      // Simulate async operation (like a database write)
      await new Promise(resolve => setTimeout(resolve, 10));

      const now = new Date().toISOString();
      const booking: Booking = {
        id: `booking_${uuid().slice(0, 8)}`,
        tenantId,
        petId,
        sitterId,
        status: 'requested',
        scheduledDate,
        startTime,
        endTime,
        notes,
        createdAt: now,
        updatedAt: now,
        statusChangedAt: now,
        statusChangedBy: createdBy,
      };

      store.createBooking(booking);

      eventBus.emit('booking.created', {
        bookingId: booking.id,
        tenantId: booking.tenantId,
        petId: booking.petId,
        sitterId: booking.sitterId,
      });

      return booking;
    });
  }

  /**
   * Update booking status with transition validation.
   * Per-booking lock is defense-in-depth: today the handler runs fully sync so
   * concurrent PATCHes serialize naturally, but a future async boundary in the
   * handler chain would reopen the TOCTOU race invisibly.
   */
  public async updateStatus(
    bookingId: string,
    newStatus: BookingStatus,
    changedBy: string,
  ): Promise<{ success: boolean; booking?: Booking; error?: string }> {
    return bookingLock.acquire(bookingId, async () => {
      const booking = store.getBooking(bookingId);

      if (!booking) {
        return { success: false, error: 'Booking not found' };
      }

      const allowedTransitions = VALID_TRANSITIONS[booking.status];
      if (!allowedTransitions.includes(newStatus)) {
        return {
          success: false,
          error: `Cannot transition from '${booking.status}' to '${newStatus}'`,
        };
      }

      // Overwrite status — no history kept
      const updatedBooking: Booking = {
        ...booking,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        statusChangedAt: new Date().toISOString(),
        statusChangedBy: changedBy,
      };

      store.updateBooking(updatedBooking);

      // Overwrite status and notify listeners
      eventBus.emit('booking.statusChanged', {
        bookingId: updatedBooking.id,
        previousStatus: booking.status,
        newStatus,
        changedBy,
      });

      return { success: true, booking: updatedBooking };
    });
  }

  /**
   * Get a single booking by ID.
   */
  public getBooking(bookingId: string): Booking | undefined {
    return store.getBooking(bookingId);
  }
}

export const bookingService = new BookingService();
