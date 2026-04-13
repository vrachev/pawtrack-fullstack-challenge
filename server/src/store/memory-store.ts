import type { Booking, Pet, Sitter, Tenant } from '../types/index.js';
import { tenants as seedTenants, pets as seedPets, bookings as seedBookings, sitters as seedSitters } from './seed.js';

class MemoryStore {
  private tenants: Map<string, Tenant> = new Map();
  private pets: Map<string, Pet> = new Map();
  private bookings: Map<string, Booking> = new Map();
  private sitters: Map<string, Sitter> = new Map();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.tenants.clear();
    this.pets.clear();
    this.bookings.clear();
    this.sitters.clear();

    for (const tenant of seedTenants) {
      this.tenants.set(tenant.id, { ...tenant });
    }
    for (const pet of seedPets) {
      this.pets.set(pet.id, { ...pet });
    }
    for (const booking of seedBookings) {
      this.bookings.set(booking.id, { ...booking });
    }
    for (const sitter of seedSitters) {
      this.sitters.set(sitter.id, { ...sitter });
    }
  }

  // Tenant operations
  public getTenant(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  // Pet operations
  public getPet(id: string): Pet | undefined {
    return this.pets.get(id);
  }

  public getPetsByTenant(tenantId: string): Pet[] {
    return Array.from(this.pets.values()).filter(p => p.tenantId === tenantId);
  }

  // Booking operations
  public getBooking(id: string): Booking | undefined {
    return this.bookings.get(id);
  }

  public getBookingsByTenant(tenantId: string): Booking[] {
    return Array.from(this.bookings.values()).filter(b => b.tenantId === tenantId);
  }

  public getAllBookings(): Booking[] {
    return Array.from(this.bookings.values());
  }

  public createBooking(booking: Booking): Booking {
    this.bookings.set(booking.id, { ...booking });
    return booking;
  }

  public updateBooking(booking: Booking): Booking {
    this.bookings.set(booking.id, { ...booking });
    return booking;
  }

  // Sitter operations
  public getSitter(id: string): Sitter | undefined {
    return this.sitters.get(id);
  }

  public getSittersByTenant(tenantId: string): Sitter[] {
    return Array.from(this.sitters.values()).filter(s => s.tenantId === tenantId);
  }
}

// Singleton instance
export const store = new MemoryStore();
