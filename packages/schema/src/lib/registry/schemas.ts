/**
 * The gallery: schemas for common businesses, each a starting point a
 * project can be created from (`vela create my-app --schema <slug>`). They
 * reference PocketBase's `users` and nothing else outside themselves.
 *
 * Shapes follow how the business actually runs, not how a tutorial
 * simplifies it: a membership is separate from the member, a booking has
 * nights and guests, an invoice has lines. Money is stored in minor units.
 */

import {
	OWNED_BY,
	bool,
	collection,
	date,
	define,
	editor,
	email,
	file,
	files,
	geo,
	index,
	json,
	number,
	relation,
	relations,
	select,
	text,
	unique,
	url
} from './define.js';

export const gymMemberships = define(
	{
		slug: 'gym-memberships',
		title: 'Gym memberships',
		summary: 'Members, plans, memberships with billing periods, check-ins and class bookings.',
		description:
			'A membership is a contract between a member and a plan, with its own start, end and status, so a member can pause, switch plans, or hold a history of past memberships. Check-ins record each visit against the membership that admitted it. Classes have a schedule and a capacity; bookings tie a member to one session and carry their attendance.',
		category: 'bookings',
		tags: ['memberships', 'subscriptions', 'check-in', 'classes']
	},
	[
		collection(
			'members',
			[
				text('first_name', { required: true }),
				text('last_name', { required: true }),
				email('email', { required: true }),
				text('phone'),
				date('date_of_birth'),
				file('photo', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
				text('emergency_contact'),
				text('notes'),
				relation('user', 'users')
			],
			{ indexes: [unique('members', 'email')] }
		),
		collection('plans', [
			text('name', { required: true }),
			text('description'),
			number('price', { required: true, min: 0, onlyInt: true }),
			select('billing_period', ['monthly', 'quarterly', 'yearly', 'one_off'], { required: true }),
			number('class_credits', { min: 0, onlyInt: true }),
			bool('active')
		]),
		collection(
			'memberships',
			[
				relation('member', 'members', { required: true, cascadeDelete: true }),
				relation('plan', 'plans', { required: true }),
				date('starts_on', { required: true }),
				date('ends_on'),
				select('status', ['active', 'paused', 'cancelled', 'expired'], { required: true }),
				number('price_paid', { min: 0, onlyInt: true }),
				text('notes')
			],
			{ indexes: [index('memberships', 'member', 'status')] }
		),
		collection(
			'check_ins',
			[
				relation('member', 'members', { required: true, cascadeDelete: true }),
				relation('membership', 'memberships'),
				date('checked_in_at', { required: true }),
				select('method', ['front_desk', 'card', 'app'])
			],
			{ indexes: [index('check_ins', 'member', 'checked_in_at')] }
		),
		collection('classes', [
			text('name', { required: true }),
			text('description'),
			relation('instructor', 'users'),
			number('capacity', { required: true, min: 1, onlyInt: true }),
			number('duration_minutes', { min: 5, onlyInt: true }),
			select('level', ['all', 'beginner', 'intermediate', 'advanced'])
		]),
		collection(
			'class_sessions',
			[
				relation('class', 'classes', { required: true, cascadeDelete: true }),
				date('starts_at', { required: true }),
				text('room'),
				bool('cancelled')
			],
			{ indexes: [index('class_sessions', 'class', 'starts_at')] }
		),
		collection(
			'class_bookings',
			[
				relation('session', 'class_sessions', { required: true, cascadeDelete: true }),
				relation('member', 'members', { required: true, cascadeDelete: true }),
				select('status', ['booked', 'waitlisted', 'attended', 'no_show', 'cancelled'], {
					required: true
				})
			],
			{ indexes: [unique('class_bookings', 'session', 'member')] }
		)
	]
);

export const hotelBookings = define(
	{
		slug: 'hotel-bookings',
		title: 'Hotel bookings',
		summary: 'Rooms by type, seasonal rates, guests, bookings with nightly pricing and payments.',
		description:
			'Room types carry what a guest chooses (a double, a suite); rooms are the physical inventory assigned at check-in. Rates set a nightly price for a room type over a date range, so a booking records the price it was actually quoted. A booking has a primary guest and may list others, and payments accumulate against it until it is settled.',
		category: 'bookings',
		tags: ['reservations', 'rooms', 'rates', 'payments']
	},
	[
		collection('room_types', [
			text('name', { required: true }),
			text('description'),
			number('max_guests', { required: true, min: 1, onlyInt: true }),
			number('base_rate', { required: true, min: 0, onlyInt: true }),
			files('photos', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
			json('amenities')
		]),
		collection(
			'rooms',
			[
				text('number', { required: true }),
				relation('room_type', 'room_types', { required: true }),
				number('floor', { onlyInt: true }),
				select('status', ['available', 'occupied', 'cleaning', 'maintenance'], { required: true }),
				text('notes')
			],
			{ indexes: [unique('rooms', 'number')] }
		),
		collection(
			'rates',
			[
				relation('room_type', 'room_types', { required: true, cascadeDelete: true }),
				text('name', { required: true }),
				date('from', { required: true }),
				date('to', { required: true }),
				number('nightly', { required: true, min: 0, onlyInt: true }),
				number('min_nights', { min: 1, onlyInt: true })
			],
			{ indexes: [index('rates', 'room_type', 'from', 'to')] }
		),
		collection('guests', [
			text('first_name', { required: true }),
			text('last_name', { required: true }),
			email('email'),
			text('phone'),
			text('nationality'),
			text('document_number'),
			text('notes'),
			relation('user', 'users')
		]),
		collection(
			'bookings',
			[
				text('reference', { required: true }),
				relation('guest', 'guests', { required: true }),
				relations('additional_guests', 'guests'),
				relation('room_type', 'room_types', { required: true }),
				relation('room', 'rooms'),
				date('check_in', { required: true }),
				date('check_out', { required: true }),
				number('adults', { required: true, min: 1, onlyInt: true }),
				number('children', { min: 0, onlyInt: true }),
				number('nightly_rate', { required: true, min: 0, onlyInt: true }),
				number('total', { required: true, min: 0, onlyInt: true }),
				select(
					'status',
					['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
					{ required: true }
				),
				select('source', ['direct', 'phone', 'website', 'ota']),
				text('special_requests')
			],
			{ indexes: [unique('bookings', 'reference'), index('bookings', 'check_in', 'check_out')] }
		),
		collection('payments', [
			relation('booking', 'bookings', { required: true, cascadeDelete: true }),
			number('amount', { required: true, onlyInt: true }),
			select('method', ['card', 'cash', 'transfer', 'ota'], { required: true }),
			date('paid_at', { required: true }),
			text('reference')
		])
	]
);

export const restaurantReservations = define(
	{
		slug: 'restaurant-reservations',
		title: 'Restaurant reservations',
		summary:
			'Tables, service periods, reservations with party size and status, guests and waitlist.',
		description:
			'Tables have a seat count and an area; service periods say when the room is open and how many covers it takes. A reservation is a party at a time, assigned to one or more tables when seated, moving through requested, confirmed, seated and finished. The waitlist holds walk-ins with how long they said they would wait.',
		category: 'bookings',
		tags: ['reservations', 'tables', 'waitlist']
	},
	[
		collection('areas', [
			text('name', { required: true }),
			bool('outdoor'),
			number('sort', { onlyInt: true })
		]),
		collection(
			'tables',
			[
				text('name', { required: true }),
				relation('area', 'areas', { required: true }),
				number('seats', { required: true, min: 1, onlyInt: true }),
				bool('active')
			],
			{ indexes: [unique('tables', 'name')] }
		),
		collection('service_periods', [
			text('name', { required: true }),
			select('day', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], {
				maxSelect: 7,
				required: true
			}),
			text('opens_at', { required: true, pattern: '^\\d{2}:\\d{2}$' }),
			text('closes_at', { required: true, pattern: '^\\d{2}:\\d{2}$' }),
			number('max_covers', { min: 1, onlyInt: true })
		]),
		collection('guests', [
			text('name', { required: true }),
			text('phone'),
			email('email'),
			text('allergies'),
			text('notes'),
			number('visits', { min: 0, onlyInt: true }),
			relation('user', 'users')
		]),
		collection(
			'reservations',
			[
				relation('guest', 'guests', { required: true }),
				date('at', { required: true }),
				number('party_size', { required: true, min: 1, onlyInt: true }),
				number('duration_minutes', { min: 15, onlyInt: true }),
				relations('tables', 'tables'),
				select('status', ['requested', 'confirmed', 'seated', 'finished', 'cancelled', 'no_show'], {
					required: true
				}),
				select('source', ['phone', 'walk_in', 'website', 'partner']),
				text('occasion'),
				text('notes')
			],
			{ indexes: [index('reservations', 'at', 'status')] }
		),
		collection('waitlist', [
			text('name', { required: true }),
			text('phone'),
			number('party_size', { required: true, min: 1, onlyInt: true }),
			number('quoted_minutes', { min: 0, onlyInt: true }),
			select('status', ['waiting', 'notified', 'seated', 'left'], { required: true }),
			relation('reservation', 'reservations')
		])
	]
);

export const clinicAppointments = define(
	{
		slug: 'clinic-appointments',
		title: 'Clinic appointments',
		summary: 'Patients, practitioners, services, availability, appointments and visit notes.',
		description:
			'Practitioners offer services of a set length; availability says when each one takes appointments. An appointment books a patient with a practitioner for a service at a time and carries its status through to completion. Visit notes are written per appointment and only the practitioner who wrote them may read them back.',
		category: 'bookings',
		tags: ['appointments', 'patients', 'scheduling', 'health']
	},
	[
		collection(
			'practitioners',
			[
				relation('user', 'users', { required: true }),
				text('title'),
				text('specialty'),
				text('bio'),
				file('photo', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
				bool('accepting_patients')
			],
			{ indexes: [unique('practitioners', 'user')] }
		),
		collection('services', [
			text('name', { required: true }),
			text('description'),
			number('duration_minutes', { required: true, min: 5, onlyInt: true }),
			number('price', { min: 0, onlyInt: true }),
			relations('practitioners', 'practitioners')
		]),
		collection('availability', [
			relation('practitioner', 'practitioners', { required: true, cascadeDelete: true }),
			select('day', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], { required: true }),
			text('from', { required: true, pattern: '^\\d{2}:\\d{2}$' }),
			text('to', { required: true, pattern: '^\\d{2}:\\d{2}$' })
		]),
		collection(
			'patients',
			[
				text('first_name', { required: true }),
				text('last_name', { required: true }),
				date('date_of_birth'),
				email('email'),
				text('phone', { required: true }),
				text('address'),
				text('insurance_number'),
				text('allergies'),
				relation('user', 'users')
			],
			{ indexes: [index('patients', 'last_name', 'first_name')] }
		),
		collection(
			'appointments',
			[
				relation('patient', 'patients', { required: true }),
				relation('practitioner', 'practitioners', { required: true }),
				relation('service', 'services', { required: true }),
				date('starts_at', { required: true }),
				date('ends_at', { required: true }),
				select(
					'status',
					['scheduled', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'],
					{ required: true }
				),
				text('reason'),
				bool('reminder_sent')
			],
			{
				indexes: [
					index('appointments', 'practitioner', 'starts_at'),
					index('appointments', 'patient', 'starts_at')
				]
			}
		),
		collection(
			'visit_notes',
			[
				relation('appointment', 'appointments', { required: true, cascadeDelete: true }),
				relation('author', 'users', { required: true }),
				editor('notes'),
				text('diagnosis'),
				text('follow_up')
			],
			{ rules: OWNED_BY('author') }
		)
	]
);

export const inventory = define(
	{
		slug: 'inventory',
		title: 'Inventory',
		summary: 'Products with variants, suppliers, locations, stock levels and every movement.',
		description:
			'Stock is never edited in place: a stock level is the sum of movements, each one a receipt, a sale, a transfer or an adjustment with a reason. Variants carry the SKU, the barcode and the price; the product holds what the variants share. Purchase orders bring stock in from a supplier and are received line by line.',
		category: 'operations',
		tags: ['stock', 'products', 'suppliers', 'purchase-orders']
	},
	[
		collection('categories', [
			text('name', { required: true }),
			relation('parent', 'categories'),
			number('sort', { onlyInt: true })
		]),
		collection('suppliers', [
			text('name', { required: true }),
			text('contact_name'),
			email('email'),
			text('phone'),
			text('address'),
			number('lead_time_days', { min: 0, onlyInt: true }),
			text('notes')
		]),
		collection('products', [
			text('name', { required: true }),
			text('description'),
			relation('category', 'categories'),
			relation('default_supplier', 'suppliers'),
			files('images', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
			bool('active')
		]),
		collection(
			'variants',
			[
				relation('product', 'products', { required: true, cascadeDelete: true }),
				text('sku', { required: true }),
				text('barcode'),
				text('name', { required: true }),
				json('attributes'),
				number('cost', { min: 0, onlyInt: true }),
				number('price', { required: true, min: 0, onlyInt: true }),
				number('reorder_point', { min: 0, onlyInt: true }),
				bool('active')
			],
			{ indexes: [unique('variants', 'sku')] }
		),
		collection('locations', [
			text('name', { required: true }),
			text('address'),
			select('kind', ['warehouse', 'store', 'van']),
			bool('active')
		]),
		collection(
			'stock_levels',
			[
				relation('variant', 'variants', { required: true, cascadeDelete: true }),
				relation('location', 'locations', { required: true, cascadeDelete: true }),
				number('on_hand', { required: true, onlyInt: true }),
				number('reserved', { min: 0, onlyInt: true })
			],
			{ indexes: [index('stock_levels', 'variant', 'location')] }
		),
		collection(
			'stock_movements',
			[
				relation('variant', 'variants', { required: true }),
				relation('location', 'locations', { required: true }),
				number('quantity', { required: true, onlyInt: true }),
				select('kind', ['receipt', 'sale', 'transfer_in', 'transfer_out', 'adjustment', 'return'], {
					required: true
				}),
				text('reference'),
				text('reason'),
				relation('recorded_by', 'users')
			],
			{ indexes: [index('stock_movements', 'variant', 'created')] }
		),
		collection(
			'purchase_orders',
			[
				text('number', { required: true }),
				relation('supplier', 'suppliers', { required: true }),
				relation('location', 'locations', { required: true }),
				select('status', ['draft', 'sent', 'partially_received', 'received', 'cancelled'], {
					required: true
				}),
				date('expected_on'),
				text('notes')
			],
			{ indexes: [unique('purchase_orders', 'number')] }
		),
		collection('purchase_order_lines', [
			relation('purchase_order', 'purchase_orders', { required: true, cascadeDelete: true }),
			relation('variant', 'variants', { required: true }),
			number('quantity', { required: true, min: 1, onlyInt: true }),
			number('received', { min: 0, onlyInt: true }),
			number('unit_cost', { min: 0, onlyInt: true })
		])
	]
);

export const courses = define(
	{
		slug: 'courses',
		title: 'Online courses',
		summary:
			'Courses with modules and lessons, enrollments, lesson progress, quizzes and certificates.',
		description:
			'A course is a tree: modules in order, lessons in order within them. Enrollment is the relationship between a learner and a course and holds completion; progress is per lesson so a dashboard can show where someone stopped. Quizzes belong to a lesson, attempts record the answers given, and a certificate is issued once per enrollment.',
		category: 'content',
		tags: ['learning', 'lessons', 'quizzes', 'certificates']
	},
	[
		collection(
			'courses',
			[
				text('title', { required: true }),
				text('slug', { required: true }),
				text('summary'),
				editor('description'),
				relation('instructor', 'users', { required: true }),
				file('cover', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
				select('level', ['beginner', 'intermediate', 'advanced']),
				number('price', { min: 0, onlyInt: true }),
				bool('published')
			],
			{ indexes: [unique('courses', 'slug')] }
		),
		collection(
			'modules',
			[
				relation('course', 'courses', { required: true, cascadeDelete: true }),
				text('title', { required: true }),
				number('sort', { required: true, onlyInt: true })
			],
			{ indexes: [index('modules', 'course', 'sort')] }
		),
		collection(
			'lessons',
			[
				relation('module', 'modules', { required: true, cascadeDelete: true }),
				text('title', { required: true }),
				editor('content'),
				url('video_url'),
				number('duration_minutes', { min: 0, onlyInt: true }),
				number('sort', { required: true, onlyInt: true }),
				bool('free_preview')
			],
			{ indexes: [index('lessons', 'module', 'sort')] }
		),
		collection(
			'enrollments',
			[
				relation('learner', 'users', { required: true, cascadeDelete: true }),
				relation('course', 'courses', { required: true, cascadeDelete: true }),
				date('enrolled_at', { required: true }),
				date('completed_at'),
				number('progress_percent', { min: 0, max: 100 })
			],
			{ indexes: [unique('enrollments', 'learner', 'course')] }
		),
		collection(
			'lesson_progress',
			[
				relation('enrollment', 'enrollments', { required: true, cascadeDelete: true }),
				relation('lesson', 'lessons', { required: true, cascadeDelete: true }),
				bool('completed'),
				number('seconds_watched', { min: 0, onlyInt: true }),
				date('last_viewed_at')
			],
			{ indexes: [index('lesson_progress', 'enrollment', 'lesson')] }
		),
		collection('quizzes', [
			relation('lesson', 'lessons', { required: true, cascadeDelete: true }),
			text('title', { required: true }),
			json('questions', { required: true }),
			number('pass_percent', { min: 0, max: 100 })
		]),
		collection('quiz_attempts', [
			relation('quiz', 'quizzes', { required: true, cascadeDelete: true }),
			relation('enrollment', 'enrollments', { required: true, cascadeDelete: true }),
			json('answers', { required: true }),
			number('score_percent', { min: 0, max: 100 }),
			bool('passed')
		]),
		collection(
			'certificates',
			[
				relation('enrollment', 'enrollments', { required: true, cascadeDelete: true }),
				text('number', { required: true }),
				date('issued_at', { required: true }),
				file('pdf', { mimeTypes: ['application/pdf'] })
			],
			{ indexes: [unique('certificates', 'number'), unique('certificates', 'enrollment')] }
		)
	]
);

export const eventTicketing = define(
	{
		slug: 'event-ticketing',
		title: 'Event ticketing',
		summary:
			'Venues, events, ticket types with quotas, orders, tickets with check-in and promo codes.',
		description:
			'An event happens at a venue and sells several ticket types, each with a price, a quota and a sales window. An order is one purchase of possibly several ticket types; every seat sold becomes a ticket with its own code, so the door can check each person in once. Promo codes discount an order and count their uses.',
		category: 'commerce',
		tags: ['events', 'tickets', 'orders', 'check-in']
	},
	[
		collection('venues', [
			text('name', { required: true }),
			text('address'),
			text('city'),
			geo('location'),
			number('capacity', { min: 0, onlyInt: true })
		]),
		collection(
			'events',
			[
				text('title', { required: true }),
				text('slug', { required: true }),
				editor('description'),
				relation('venue', 'venues', { required: true }),
				relation('organizer', 'users', { required: true }),
				date('starts_at', { required: true }),
				date('ends_at'),
				file('cover', { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }),
				select('status', ['draft', 'on_sale', 'sold_out', 'past', 'cancelled'], { required: true })
			],
			{ indexes: [unique('events', 'slug'), index('events', 'starts_at')] }
		),
		collection('ticket_types', [
			relation('event', 'events', { required: true, cascadeDelete: true }),
			text('name', { required: true }),
			text('description'),
			number('price', { required: true, min: 0, onlyInt: true }),
			number('quota', { required: true, min: 0, onlyInt: true }),
			number('sold', { min: 0, onlyInt: true }),
			date('sales_start'),
			date('sales_end'),
			number('max_per_order', { min: 1, onlyInt: true })
		]),
		collection(
			'promo_codes',
			[
				relation('event', 'events', { required: true, cascadeDelete: true }),
				text('code', { required: true }),
				select('kind', ['percent', 'amount'], { required: true }),
				number('value', { required: true, min: 0, onlyInt: true }),
				number('max_uses', { min: 0, onlyInt: true }),
				number('uses', { min: 0, onlyInt: true }),
				date('expires_at')
			],
			{ indexes: [unique('promo_codes', 'event', 'code')] }
		),
		collection(
			'orders',
			[
				text('number', { required: true }),
				relation('event', 'events', { required: true }),
				relation('buyer', 'users'),
				email('email', { required: true }),
				text('name', { required: true }),
				relation('promo_code', 'promo_codes'),
				number('subtotal', { required: true, min: 0, onlyInt: true }),
				number('discount', { min: 0, onlyInt: true }),
				number('total', { required: true, min: 0, onlyInt: true }),
				select('status', ['pending', 'paid', 'refunded', 'cancelled'], { required: true }),
				text('payment_reference')
			],
			{ indexes: [unique('orders', 'number')] }
		),
		collection(
			'tickets',
			[
				relation('order', 'orders', { required: true, cascadeDelete: true }),
				relation('ticket_type', 'ticket_types', { required: true }),
				text('code', { required: true }),
				text('holder_name'),
				date('checked_in_at'),
				relation('checked_in_by', 'users'),
				select('status', ['valid', 'used', 'refunded', 'void'], { required: true })
			],
			{ indexes: [unique('tickets', 'code'), index('tickets', 'order')] }
		)
	]
);

export const invoicing = define(
	{
		slug: 'invoicing',
		title: 'Invoicing',
		summary: 'Clients, items, invoices with lines and tax, payments, recurring schedules.',
		description:
			'An invoice is a header with lines; the totals are stored on the header when it is issued so a later price change does not rewrite history. Payments are recorded against invoices and may be partial. A recurring schedule describes an invoice to raise again on an interval and remembers when it last did.',
		category: 'finance',
		tags: ['invoices', 'payments', 'clients', 'recurring']
	},
	[
		collection(
			'clients',
			[
				text('name', { required: true }),
				text('contact_name'),
				email('email', { required: true }),
				text('phone'),
				text('billing_address'),
				text('tax_id'),
				text('currency', { min: 3, max: 3 }),
				number('payment_terms_days', { min: 0, onlyInt: true }),
				text('notes'),
				relation('owner', 'users', { required: true })
			],
			{ rules: OWNED_BY('owner') }
		),
		collection(
			'items',
			[
				text('name', { required: true }),
				text('description'),
				number('unit_price', { required: true, min: 0, onlyInt: true }),
				number('tax_rate', { min: 0, max: 100 }),
				text('unit'),
				bool('active'),
				relation('owner', 'users', { required: true })
			],
			{ rules: OWNED_BY('owner') }
		),
		collection(
			'invoices',
			[
				text('number', { required: true }),
				relation('client', 'clients', { required: true }),
				date('issued_on', { required: true }),
				date('due_on', { required: true }),
				select('status', ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'], {
					required: true
				}),
				text('currency', { required: true, min: 3, max: 3 }),
				number('subtotal', { min: 0, onlyInt: true }),
				number('tax', { min: 0, onlyInt: true }),
				number('total', { min: 0, onlyInt: true }),
				number('amount_paid', { min: 0, onlyInt: true }),
				text('notes'),
				file('pdf', { mimeTypes: ['application/pdf'] }),
				relation('owner', 'users', { required: true })
			],
			{
				rules: OWNED_BY('owner'),
				indexes: [unique('invoices', 'number'), index('invoices', 'client', 'status')]
			}
		),
		collection('invoice_lines', [
			relation('invoice', 'invoices', { required: true, cascadeDelete: true }),
			relation('item', 'items'),
			text('description', { required: true }),
			number('quantity', { required: true, min: 0 }),
			number('unit_price', { required: true, min: 0, onlyInt: true }),
			number('tax_rate', { min: 0, max: 100 }),
			number('total', { min: 0, onlyInt: true }),
			number('sort', { onlyInt: true })
		]),
		collection('payments', [
			relation('invoice', 'invoices', { required: true, cascadeDelete: true }),
			number('amount', { required: true, onlyInt: true }),
			date('paid_on', { required: true }),
			select('method', ['transfer', 'card', 'cash', 'cheque', 'other'], { required: true }),
			text('reference'),
			text('notes')
		]),
		collection(
			'recurring_invoices',
			[
				relation('client', 'clients', { required: true, cascadeDelete: true }),
				select('every', ['week', 'month', 'quarter', 'year'], { required: true }),
				date('next_on', { required: true }),
				date('last_issued_on'),
				json('lines', { required: true }),
				bool('active'),
				relation('owner', 'users', { required: true })
			],
			{ rules: OWNED_BY('owner') }
		)
	]
);

export const gallery = [
	gymMemberships,
	hotelBookings,
	restaurantReservations,
	clinicAppointments,
	inventory,
	courses,
	eventTicketing,
	invoicing
];
